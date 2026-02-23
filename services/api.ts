import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NGROK_URL = 'https://relevant-hermit-pretty.ngrok-free.app';
const API_MODE_KEY = 'api_mode'; // 'prod' or 'local'

// Cached mode to avoid async reads on every request
let cachedMode: 'prod' | 'local' = 'local';

export async function loadApiMode(): Promise<'prod' | 'local'> {
  try {
    const stored = await AsyncStorage.getItem(API_MODE_KEY);
    cachedMode = stored === 'prod' ? 'prod' : 'local';
  } catch {
    cachedMode = 'local';
  }
  return cachedMode;
}

export async function setApiMode(mode: 'prod' | 'local'): Promise<void> {
  cachedMode = mode;
  await AsyncStorage.setItem(API_MODE_KEY, mode);
}

export function getApiMode(): 'prod' | 'local' {
  return cachedMode;
}

function getLocalBaseUrl(): string {
  const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    const host = debuggerHost.split(':')[0];
    return `http://${host}:3050`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3050';
  return 'http://localhost:3050';
}

function getApiBaseUrl(): string {
  return cachedMode === 'prod' ? NGROK_URL : getLocalBaseUrl();
}

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
  const baseUrl = getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(
      `Nu se poate conecta la server (${baseUrl}). Verifică că serverul rulează și că telefonul e pe aceeași rețea.`
    );
  }

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet<T = unknown>(path: string, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('GET', path, undefined, token);
}

export async function apiPost<T = unknown>(path: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('POST', path, body, token);
}
