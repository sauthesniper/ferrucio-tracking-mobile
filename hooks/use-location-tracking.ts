import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { apiPost } from '@/services/api';
import { useAuth } from '@/context/auth-context';
import { BACKGROUND_LOCATION_TASK, setBackgroundApiUrl } from '@/services/location-task';
import Constants from 'expo-constants';

const POLL_MS = 2_000;
const BG_INTERVAL_MS = 3_000;

interface LocationTrackingState {
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  permissionDenied: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
}

function resolveApiBaseUrl(): string {
  const debuggerHost =
    Constants.expoConfig?.hostUri ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3050`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3050';
  return 'http://localhost:3050';
}

export function useLocationTracking(): LocationTrackingState {
  const { token } = useAuth();
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef(token);
  const accelRef = useRef({ x: 0, y: 0, z: 0 });
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const screenOnRef = useRef(true);

  useEffect(() => { tokenRef.current = token; }, [token]);

  // Track screen state via AppState
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      screenOnRef.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  // Subscribe to accelerometer + gyroscope
  useEffect(() => {
    Accelerometer.setUpdateInterval(500);
    Gyroscope.setUpdateInterval(500);
    const accelSub = Accelerometer.addListener((data) => { accelRef.current = data; });
    const gyroSub = Gyroscope.addListener((data) => { gyroRef.current = data; });
    return () => { accelSub.remove(); gyroSub.remove(); };
  }, []);

  const send = useCallback(async (loc: Location.LocationObject) => {
    const lat = loc.coords.latitude;
    const lon = loc.coords.longitude;
    const spd = loc.coords.speed ?? null;
    try {
      await apiPost(
        '/api/locations',
        {
          latitude: lat,
          longitude: lon,
          timestamp: new Date(loc.timestamp).toISOString(),
          speed: spd,
          accel_x: accelRef.current.x,
          accel_y: accelRef.current.y,
          accel_z: accelRef.current.z,
          gyro_x: gyroRef.current.x,
          gyro_y: gyroRef.current.y,
          gyro_z: gyroRef.current.z,
          screen_on: screenOnRef.current,
        },
        tokenRef.current
      );
    } catch { /* retry next tick */ }
  }, []);

  const update = useCallback((loc: Location.LocationObject) => {
    setLatitude(loc.coords.latitude);
    setLongitude(loc.coords.longitude);
    setSpeed(loc.coords.speed ?? null);
    setError(null);
    send(loc);
  }, [send]);

  useEffect(() => {
    let dead = false;
    setBackgroundApiUrl(resolveApiBaseUrl());

    (async () => {
      try {
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        if (dead) return;
        if (fg !== 'granted') { setPermissionDenied(true); return; }

        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        if (dead) return;
        const hasBg = bg === 'granted';

        // Immediate read
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
          if (!dead) update(pos);
        } catch {
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last && !dead) update(last);
          } catch { /* noop */ }
        }

        // Watcher
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: POLL_MS, distanceInterval: 0 },
          (loc) => { if (!dead) update(loc); }
        );

        // Polling fallback
        pollRef.current = setInterval(async () => {
          if (dead) return;
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
            if (!dead) update(pos);
          } catch { /* noop */ }
        }, POLL_MS);

        // Background task
        if (hasBg) {
          const running = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
          if (!running) {
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
              accuracy: Location.Accuracy.BestForNavigation,
              timeInterval: BG_INTERVAL_MS,
              distanceInterval: 0,
              deferredUpdatesInterval: BG_INTERVAL_MS,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'GPS Tracker',
                notificationBody: 'Tracking your location in real-time',
                notificationColor: '#007AFF',
              },
            });
          }
        }
      } catch (err) {
        if (!dead) setError(err instanceof Error ? err.message : 'Location tracking failed');
      }
    })();

    return () => {
      dead = true;
      watchRef.current?.remove();
      watchRef.current = null;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      (async () => {
        try {
          if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK))
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        } catch { /* noop */ }
      })();
    };
  }, [token, update]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      update(pos);
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) update(last);
      } catch { /* noop */ }
    } finally {
      setRefreshing(false);
    }
  }, [update]);

  return { latitude, longitude, speed, permissionDenied, error, refreshing, refresh };
}
