import Constants from 'expo-constants';
import { Platform } from 'react-native';

function getApiBaseUrl(): string {
  // In Expo Go / dev builds, use the debugger host IP
  const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3050`;
  }
  // Android emulator uses 10.0.2.2 to reach host machine
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3050';
  }
  return 'http://localhost:3050';
}

const API_BASE_URL = getApiBaseUrl();

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet<T = unknown>(path: string, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('GET', path, undefined, token);
}

export async function apiPost<T = unknown>(path: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('POST', path, body, token);
}
