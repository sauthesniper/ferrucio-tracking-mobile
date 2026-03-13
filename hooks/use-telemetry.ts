import { useEffect, useRef, useCallback } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Network from 'expo-network';
import { useAuth } from '@/context/auth-context';
import { apiPost } from '@/services/api';
import {
  TelemetryEntry,
  cacheTelemetryEntries,
  getUnsyncedEntries,
  markEntriesSynced,
  purgeSyncedEntries,
} from '@/services/telemetry-cache';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const MAX_BACKOFF_MS = 60_000;
const INITIAL_BACKOFF_MS = 1_000;

/** Simple UUID v4 generator (no external dependency). */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Module-level background location task definition ──
// TaskManager tasks must be defined at the top level, outside any component or hook.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  // Convert each received location into a TelemetryEntry and cache it.
  // The hook's sync logic will pick these up and upload them.
  const entries: TelemetryEntry[] = locations.map((loc) => ({
    idempotency_key: uuidv4(),
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    speed: loc.coords.speed ?? null,
    accel_x: 0,
    accel_y: 0,
    accel_z: 0,
    gyro_x: 0,
    gyro_y: 0,
    gyro_z: 0,
    screen_on: false,
    battery_level: null,
    signal_strength: null,
    recorded_at: new Date(loc.timestamp).toISOString(),
  }));

  await cacheTelemetryEntries(entries);
});


/**
 * Hook that collects telemetry (GPS, sensors, battery, network) using
 * expo-location background tasks and uploads batches to the backend.
 * Caches locally when offline and syncs on reconnect.
 *
 * @param active - Whether telemetry collection is active (tied to attendance session).
 * @param sessionId - The current attendance session ID (optional, for context).
 */
export function useTelemetry(active: boolean, sessionId?: number | null) {
  const { token } = useAuth();
  const tokenRef = useRef(token);
  const activeRef = useRef(active);

  // Sensor data refs (updated via subscriptions)
  const accelRef = useRef({ x: 0, y: 0, z: 0 });
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const screenOnRef = useRef(true);

  // Batch buffer (for foreground-enriched entries)
  const bufferRef = useRef<TelemetryEntry[]>([]);

  // Backoff state for retries
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  // Timer refs
  const syncRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Track screen state
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      screenOnRef.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  // Subscribe to sensors
  useEffect(() => {
    if (!active) return;

    Accelerometer.setUpdateInterval(1000);
    Gyroscope.setUpdateInterval(1000);
    const accelSub = Accelerometer.addListener((d) => { accelRef.current = d; });
    const gyroSub = Gyroscope.addListener((d) => { gyroRef.current = d; });

    return () => {
      accelSub.remove();
      gyroSub.remove();
    };
  }, [active]);

  /** Upload a batch of entries to the backend. Returns true on success. */
  const uploadBatch = useCallback(async (entries: TelemetryEntry[]): Promise<boolean> => {
    if (entries.length === 0) return true;
    try {
      const res = await apiPost(
        '/api/telemetry/batch',
        { entries },
        tokenRef.current,
      );
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  /** Attempt to sync cached (unsynced) entries with exponential backoff. */
  const syncCached = useCallback(async () => {
    const unsynced = await getUnsyncedEntries();
    if (unsynced.length === 0) {
      backoffRef.current = INITIAL_BACKOFF_MS;
      return;
    }

    const ok = await uploadBatch(unsynced);
    if (ok) {
      await markEntriesSynced(unsynced.map((e) => e.idempotency_key));
      await purgeSyncedEntries();
      backoffRef.current = INITIAL_BACKOFF_MS;
    } else {
      // Schedule retry with exponential backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      syncRef.current = setTimeout(syncCached, delay);
    }
  }, [uploadBatch]);

  /** Flush the buffer: try to upload, cache on failure. */
  const flushBuffer = useCallback(async () => {
    const entries = bufferRef.current.splice(0);
    if (entries.length === 0) return;

    let isOnline = false;
    try {
      const netState = await Network.getNetworkStateAsync();
      isOnline = netState.isConnected === true && netState.isInternetReachable !== false;
    } catch { /* assume offline */ }

    if (isOnline) {
      const ok = await uploadBatch(entries);
      if (ok) {
        backoffRef.current = INITIAL_BACKOFF_MS;
        syncCached();
      } else {
        await cacheTelemetryEntries(entries);
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        syncRef.current = setTimeout(syncCached, delay);
      }
    } else {
      await cacheTelemetryEntries(entries);
    }
  }, [uploadBatch, syncCached]);

  // ── Main effect: start/stop background location updates ──
  useEffect(() => {
    if (!active) {
      // Stop: flush remaining buffer, stop location updates, clean up timers
      flushBuffer();
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .then((started) => {
          if (started) {
            return Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
        })
        .catch(() => { /* task may not be registered yet */ });
      if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
      return;
    }

    let cancelled = false;

    const startBackgroundLocation = async () => {
      try {
        // Request foreground permission first (required before background)
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') return;

        // Request background permission
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          Alert.alert(
            'Permisiune Locație Background',
            'Aplicația necesită permisiunea de locație în background pentru tracking GPS continuu. Te rugăm să activezi permisiunea din setări.',
            [
              { text: 'Anulează', style: 'cancel' },
              { text: 'Deschide Setări', onPress: () => Linking.openSettings() },
            ],
          );
          return;
        }

        if (cancelled) return;

        // Stop any previously running task before starting fresh
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (alreadyStarted) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 30000,
          distanceInterval: 0,
          foregroundService: {
            notificationTitle: 'Pontaj Activ',
            notificationBody: 'Tracking GPS activ',
          },
          showsBackgroundLocationIndicator: true,
        });

        // Also try to sync any previously cached entries on start
        syncCached();
      } catch {
        // Location services unavailable — skip
      }
    };

    startBackgroundLocation();

    return () => {
      cancelled = true;
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .then((started) => {
          if (started) {
            return Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          }
        })
        .catch(() => { /* noop */ });
      if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
    };
  }, [active, flushBuffer, syncCached]);

  // Listen for network reconnection to trigger sync
  useEffect(() => {
    if (!active) return;

    let lastOnline = true;
    const checkInterval = setInterval(async () => {
      try {
        const netState = await Network.getNetworkStateAsync();
        const isOnline = netState.isConnected === true && netState.isInternetReachable !== false;
        if (isOnline && !lastOnline) {
          // Just came back online — sync cached entries
          backoffRef.current = INITIAL_BACKOFF_MS;
          syncCached();
        }
        lastOnline = isOnline;
      } catch { /* noop */ }
    }, 10_000);

    return () => clearInterval(checkInterval);
  }, [active, syncCached]);
}
