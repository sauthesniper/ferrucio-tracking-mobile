import { Platform } from 'react-native';

const PROD_URL = 'https://gps-tracking-api.code-envision.ro';

// Always use production API
let cachedMode: 'prod' | 'local' = 'prod';

export async function loadApiMode(): Promise<'prod' | 'local'> {
  return cachedMode;
}

export async function setApiMode(_mode: 'prod' | 'local'): Promise<void> {
  // no-op in production — always use prod
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
  return cachedMode === 'prod' ? PROD_URL : getLocalBaseUrl();
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Serverul nu a răspuns în 10 secunde (${baseUrl}). Verifică că serverul rulează și că telefonul e pe aceeași rețea.`
      );
    }
    throw new Error(
      `Nu se poate conecta la server (${baseUrl}). Verifică că serverul rulează și că telefonul e pe aceeași rețea.`
    );
  }

  // Auto-refresh interceptor: on 401, attempt token refresh and retry
  if (res.status === 401 && path !== '/api/auth/refresh') {
    try {
      // Lazy import to avoid circular dependency (auth-service imports from api)
      const { refreshToken, clearRefreshToken } = await import('@/services/auth-service');
      const refreshResult = await refreshToken();
      if (refreshResult) {
        // Store new JWT in SecureStore
        if (Platform.OS === 'web') {
          localStorage.setItem('auth_token', refreshResult.token);
        } else {
          const SecureStore = await import('expo-secure-store');
          await SecureStore.setItemAsync('auth_token', refreshResult.token);
        }
        // Retry the original request with the new token
        return request<T>(method, path, body, refreshResult.token);
      } else {
        // Refresh failed — clear tokens, let caller handle redirect to login
        await clearRefreshToken();
        if (Platform.OS === 'web') {
          localStorage.removeItem('auth_token');
        } else {
          const SecureStore = await import('expo-secure-store');
          await SecureStore.deleteItemAsync('auth_token');
        }
      }
    } catch {
      // If refresh attempt itself fails, fall through to return the 401 response
    }
  }

  let data: T;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    throw new Error(
      `Serverul a returnat un răspuns neașteptat (${res.status}). Verifică URL-ul serverului.`
    );
  }

  return { ok: res.ok, status: res.status, data };
}


export async function apiGet<T = unknown>(path: string, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('GET', path, undefined, token);
}

export async function apiPost<T = unknown>(path: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
  return request<T>('POST', path, body, token);
}
