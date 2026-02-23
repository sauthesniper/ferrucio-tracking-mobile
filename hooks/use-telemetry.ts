import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Battery from 'expo-battery';
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

const COLLECT_INTERVAL_MS = 30_000; // 30 seconds
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

/**
 * Hook that collects telemetry (GPS, sensors, battery, network) at 30s intervals
 * and uploads batches to the backend. Caches locally when offline and syncs on reconnect.
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

  // Batch buffer
  const bufferRef = useRef<TelemetryEntry[]>([]);

  // Backoff state for retries
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  // Interval / timer refs
  const collectRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  /** Collect a single telemetry reading and add to buffer. */
  const collectReading = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let batteryLevel: number | null = null;
      try {
        batteryLevel = await Battery.getBatteryLevelAsync();
      } catch { /* not available on all devices */ }

      let signalStrength: number | null = null;
      try {
        const netState = await Network.getNetworkStateAsync();
        // expo-network doesn't expose signal strength directly;
        // use a simple heuristic: 1.0 if connected, 0.0 if not
        signalStrength = netState.isConnected ? 1.0 : 0.0;
      } catch { /* noop */ }

      const entry: TelemetryEntry = {
        idempotency_key: uuidv4(),
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        speed: loc.coords.speed ?? null,
        accel_x: accelRef.current.x,
        accel_y: accelRef.current.y,
        accel_z: accelRef.current.z,
        gyro_x: gyroRef.current.x,
        gyro_y: gyroRef.current.y,
        gyro_z: gyroRef.current.z,
        screen_on: screenOnRef.current,
        battery_level: batteryLevel,
        signal_strength: signalStrength,
        recorded_at: new Date(loc.timestamp).toISOString(),
      };

      bufferRef.current.push(entry);
    } catch {
      // Location unavailable — skip this reading
    }
  }, []);

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
        // Successfully uploaded — also try syncing any previously cached entries
        backoffRef.current = INITIAL_BACKOFF_MS;
        syncCached();
      } else {
        // Upload failed — cache for later
        await cacheTelemetryEntries(entries);
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        syncRef.current = setTimeout(syncCached, delay);
      }
    } else {
      // Offline — cache locally
      await cacheTelemetryEntries(entries);
    }
  }, [uploadBatch, syncCached]);

  // Main collection loop
  useEffect(() => {
    if (!active) {
      // Stop: flush remaining buffer and clean up
      flushBuffer();
      if (collectRef.current) { clearInterval(collectRef.current); collectRef.current = null; }
      if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
      return;
    }

    // Collect immediately, then at interval
    collectReading();

    collectRef.current = setInterval(async () => {
      await collectReading();
      await flushBuffer();
    }, COLLECT_INTERVAL_MS);

    // On start, also try to sync any previously cached entries
    syncCached();

    return () => {
      if (collectRef.current) { clearInterval(collectRef.current); collectRef.current = null; }
      if (syncRef.current) { clearTimeout(syncRef.current); syncRef.current = null; }
    };
  }, [active, collectReading, flushBuffer, syncCached]);

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
