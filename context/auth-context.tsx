import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiPost } from '@/services/api';
import {
  verifyOtp as verifyOtpApi,
  loginWithCode as loginWithCodeApi,
  refreshToken as refreshTokenApi,
  storeRefreshToken,
  clearRefreshToken,
} from '@/services/auth-service';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// expo-secure-store doesn't work on web — use localStorage as fallback
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

interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

interface UserInfo {
  id: number;
  username: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: UserInfo | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithOtp: (phone: string, code: string) => Promise<void>;
  loginWithCode: (loginCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function isTokenExpired(payload: JwtPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Try to restore session from stored tokens on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await storage.getItem(TOKEN_KEY);
        if (storedToken) {
          const payload = decodeJwtPayload(storedToken);
          if (payload && !isTokenExpired(payload)) {
            setToken(storedToken);
            setUser({ id: payload.userId, username: payload.username, role: payload.role });
          } else {
            // JWT expired — try refresh
            const refreshResult = await refreshTokenApi();
            if (refreshResult) {
              await storage.setItem(TOKEN_KEY, refreshResult.token);
              setToken(refreshResult.token);
              setUser({
                id: refreshResult.user.id,
                username: refreshResult.user.username,
                role: refreshResult.user.role,
              });
            } else {
              await storage.deleteItem(TOKEN_KEY);
              await clearRefreshToken();
            }
          }
        }
      } catch {
        // Ignore errors reading from secure store
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Helper to set auth state after successful authentication
  const setAuthState = useCallback(
    async (newToken: string, refreshTkn: string, userInfo: UserInfo) => {
      await storage.setItem(TOKEN_KEY, newToken);
      await storeRefreshToken(refreshTkn);
      setToken(newToken);
      setUser(userInfo);
    },
    []
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiPost<{
      token: string;
      refreshToken?: string;
      user: { id: number; username: string; role: string };
    }>('/api/auth/login', { username, password });

    if (!res.ok) {
      const errorData = res.data as unknown as { error?: string };
      throw new Error(errorData.error ?? 'Login failed');
    }

    const { token: newToken, refreshToken: refreshTkn, user: userInfo } = res.data;
    await storage.setItem(TOKEN_KEY, newToken);
    if (refreshTkn) {
      await storeRefreshToken(refreshTkn);
    }
    setToken(newToken);
    setUser({ id: userInfo.id, username: userInfo.username, role: userInfo.role });
  }, []);

  const loginWithOtp = useCallback(
    async (phone: string, code: string) => {
      const result = await verifyOtpApi(phone, code);
      if (!result.token || !result.refreshToken || !result.user) {
        throw new Error(result.message ?? 'Phone verified but no user account found');
      }
      await setAuthState(result.token, result.refreshToken, {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
      });
    },
    [setAuthState]
  );

  const loginWithCode = useCallback(
    async (loginCode: string) => {
      const result = await loginWithCodeApi(loginCode);
      await setAuthState(result.token, result.refreshToken, {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
      });
    },
    [setAuthState]
  );

  const logout = useCallback(async () => {
    await storage.deleteItem(TOKEN_KEY);
    await clearRefreshToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, user, isLoading, login, loginWithOtp, loginWithCode, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
