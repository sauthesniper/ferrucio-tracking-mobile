import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'telemetry_cache';

export interface TelemetryEntry {
  idempotency_key: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  accel_x: number;
  accel_y: number;
  accel_z: number;
  gyro_x: number;
  gyro_y: number;
  gyro_z: number;
  screen_on: boolean;
  battery_level: number | null;
  signal_strength: number | null;
  recorded_at: string;
  synced?: boolean;
}

/**
 * Store a batch of telemetry entries in local cache (AsyncStorage).
 * Appends to existing cached entries.
 */
export async function cacheTelemetryEntries(entries: TelemetryEntry[]): Promise<void> {
  const existing = await getCachedEntries();
  const updated = [...existing, ...entries.map((e) => ({ ...e, synced: false }))];
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

/**
 * Retrieve all cached (unsynced) entries in chronological order.
 */
export async function getUnsyncedEntries(): Promise<TelemetryEntry[]> {
  const all = await getCachedEntries();
  return all
    .filter((e) => !e.synced)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
}

/**
 * Mark entries as synced by their idempotency keys.
 */
export async function markEntriesSynced(keys: string[]): Promise<void> {
  const all = await getCachedEntries();
  const keySet = new Set(keys);
  const updated = all.map((e) =>
    keySet.has(e.idempotency_key) ? { ...e, synced: true } : e
  );
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

/**
 * Remove all synced entries from cache to free storage.
 */
export async function purgeSyncedEntries(): Promise<void> {
  const all = await getCachedEntries();
  const unsynced = all.filter((e) => !e.synced);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(unsynced));
}

/**
 * Clear the entire telemetry cache.
 */
export async function clearTelemetryCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

async function getCachedEntries(): Promise<TelemetryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TelemetryEntry[];
  } catch {
    return [];
  }
}
