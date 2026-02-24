import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiPost } from '@/services/api';

/**
 * Requests notification permissions, gets the Expo Push Token,
 * and registers it with the backend.
 * Silently fails — push is best-effort.
 */
export async function registerPushToken(authToken: string): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return; // User declined — continue without push
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const pushToken = await Notifications.getExpoPushTokenAsync();
    await apiPost('/api/push-token', { token: pushToken.data }, authToken);
  } catch {
    // Silently ignore — push registration is best-effort
  }
}
