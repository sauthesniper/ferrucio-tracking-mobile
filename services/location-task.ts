import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';

let apiBaseUrl = 'http://localhost:3050';

export const BACKGROUND_LOCATION_TASK = 'background-location-task';

export function setBackgroundApiUrl(url: string) {
  apiBaseUrl = url;
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as {
    locations: Array<{
      coords: { latitude: number; longitude: number; speed: number | null };
      timestamp: number;
    }>;
  };
  if (!locations || locations.length === 0) return;

  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;

    for (const loc of locations) {
      try {
        await fetch(`${apiBaseUrl}/api/locations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: new Date(loc.timestamp).toISOString(),
            speed: loc.coords.speed ?? null,
            screen_on: false, // background = screen off
          }),
        });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
});
