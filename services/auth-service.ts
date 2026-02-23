import { apiPost } from '@/services/api';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'refresh_token';

// Secure storage helper (same pattern as auth-context)
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface OtpResponse {
  success: boolean;
  message: string;
}

interface VerifyOtpResponse {
  success: boolean;
  verified: boolean;
  token?: string;
  refreshToken?: string;
  user?: { id: number; username: string; role: string };
  message?: string;
}

interface LoginCodeResponse {
  token: string;
  refreshToken: string;
  user: { id: number; username: string; role: string };
}

interface RefreshResponse {
  token: string;
  refreshToken: string;
  user: { id: number; username: string; role: string };
}

interface ErrorResponse {
  error: string;
  code?: string;
}

export async function requestOtp(phone: string): Promise<OtpResponse> {
  const res = await apiPost<OtpResponse>('/api/auth/request-otp', { phone });
  if (!res.ok) {
    const err = res.data as unknown as ErrorResponse;
    throw new Error(err.error ?? 'Failed to request OTP');
  }
  return res.data;
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<VerifyOtpResponse> {
  const res = await apiPost<VerifyOtpResponse>('/api/auth/verify-otp', {
    phone,
    code,
  });
  if (!res.ok) {
    const err = res.data as unknown as ErrorResponse;
    throw new Error(err.error ?? 'OTP verification failed');
  }
  return res.data;
}

export async function loginWithCode(
  loginCode: string
): Promise<LoginCodeResponse> {
  const res = await apiPost<LoginCodeResponse>('/api/auth/login-code', {
    login_code: loginCode,
  });
  if (!res.ok) {
    const err = res.data as unknown as ErrorResponse;
    throw new Error(err.error ?? 'Login code authentication failed');
  }
  return res.data;
}

export async function refreshToken(): Promise<RefreshResponse | null> {
  const storedRefreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
  if (!storedRefreshToken) return null;

  const res = await apiPost<RefreshResponse>('/api/auth/refresh', {
    refreshToken: storedRefreshToken,
  });

  if (!res.ok) {
    // Refresh failed — clear stored refresh token
    await storage.deleteItem(REFRESH_TOKEN_KEY);
    return null;
  }

  // Store the new refresh token (rotation)
  await storage.setItem(REFRESH_TOKEN_KEY, res.data.refreshToken);
  return res.data;
}

export async function storeRefreshToken(token: string): Promise<void> {
  await storage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await storage.deleteItem(REFRESH_TOKEN_KEY);
}
