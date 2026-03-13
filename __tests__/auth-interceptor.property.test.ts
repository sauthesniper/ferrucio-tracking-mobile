/**
 * Feature: app-persistence-fixes, Property 2: Auto-refresh interceptor at 401
 *
 * For any API request that returns 401 and a valid refresh token exists,
 * the interceptor must call the refresh endpoint, store the new JWT,
 * and retry the original request with the new token — transparently.
 *
 * Validates: Requirements 1.2, 1.5
 */

import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock SecureStore (must be set up before importing api module)
// ---------------------------------------------------------------------------
const secureStoreData = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => secureStoreData.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStoreData.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureStoreData.delete(key);
  }),
}));

// ---------------------------------------------------------------------------
// Mock react-native Platform
// ---------------------------------------------------------------------------
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

// ---------------------------------------------------------------------------
// Mock auth-service: refreshToken returns new tokens, clearRefreshToken clears
// ---------------------------------------------------------------------------
const mockRefreshToken = jest.fn();
const mockClearRefreshToken = jest.fn();

jest.mock('@/services/auth-service', () => ({
  refreshToken: (...args: unknown[]) => mockRefreshToken(...args),
  clearRefreshToken: (...args: unknown[]) => mockClearRefreshToken(...args),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { apiGet, apiPost } from '../services/api';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Random API path that is NOT the refresh endpoint */
const apiPathArb = fc
  .stringMatching(/^\/api\/[a-z][a-z0-9\-\/]{0,40}$/)
  .filter((p) => p !== '/api/auth/refresh');

const newJwtArb = fc.string({ minLength: 10, maxLength: 120 }).map((s) => `new-jwt-${s}`);

const roleArb = fc.constantFrom('admin', 'leader', 'employee');

const userArb = fc.record({
  id: fc.integer({ min: 1, max: 100_000 }),
  username: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  role: roleArb,
});

const successDataArb = fc.record({
  message: fc.string({ minLength: 1, maxLength: 50 }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonResponse(status: number, body: unknown): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------
describe('Property 2: Auto-refresh interceptor at 401', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    secureStoreData.clear();
    jest.clearAllMocks();
  });

  it(
    'intercepts 401, refreshes the token, stores new JWT, and retries with the new token',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          apiPathArb,
          newJwtArb,
          userArb,
          successDataArb,
          async (path, newJwt, user, successBody) => {
            // Reset state
            secureStoreData.clear();
            jest.clearAllMocks();

            // Track calls to fetch to verify retry uses new token
            let fetchCallCount = 0;
            const capturedAuthHeaders: (string | undefined)[] = [];

            globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
              fetchCallCount++;
              const authHeader = (init?.headers as Record<string, string>)?.['Authorization'];
              capturedAuthHeaders.push(authHeader);

              if (fetchCallCount === 1) {
                // First call: return 401 (token expired)
                return makeJsonResponse(401, { error: 'Token expired' });
              }
              // Second call (retry): return 200 with success data
              return makeJsonResponse(200, successBody);
            }) as jest.Mock;

            // Mock refreshToken to succeed and return new tokens
            const refreshResult = {
              token: newJwt,
              refreshToken: `refresh-${newJwt}`,
              user,
            };
            mockRefreshToken.mockResolvedValueOnce(refreshResult);

            // Call apiGet — should get 401, refresh, retry, and succeed
            const result = await apiGet(path, 'expired-token');

            // Verify: interceptor called refreshToken
            expect(mockRefreshToken).toHaveBeenCalledTimes(1);

            // Verify: fetch was called twice (original 401 + retry)
            expect(fetchCallCount).toBe(2);

            // Verify: retry used the new JWT from refresh result
            expect(capturedAuthHeaders[1]).toBe(`Bearer ${newJwt}`);

            // Verify: new JWT was stored in SecureStore
            expect(secureStoreData.get('auth_token')).toBe(newJwt);

            // Verify: final result is successful (transparent to caller)
            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            expect(result.data).toEqual(successBody);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'also works with apiPost — intercepts 401, refreshes, and retries POST with body',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          apiPathArb,
          newJwtArb,
          userArb,
          successDataArb,
          async (path, newJwt, user, successBody) => {
            secureStoreData.clear();
            jest.clearAllMocks();

            let fetchCallCount = 0;
            const capturedBodies: (string | undefined)[] = [];

            globalThis.fetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
              fetchCallCount++;
              capturedBodies.push(init?.body as string | undefined);

              if (fetchCallCount === 1) {
                return makeJsonResponse(401, { error: 'Token expired' });
              }
              return makeJsonResponse(200, successBody);
            }) as jest.Mock;

            const refreshResult = {
              token: newJwt,
              refreshToken: `refresh-${newJwt}`,
              user,
            };
            mockRefreshToken.mockResolvedValueOnce(refreshResult);

            const postBody = { action: 'test', userId: user.id };
            const result = await apiPost(path, postBody, 'expired-token');

            // Verify interceptor worked
            expect(mockRefreshToken).toHaveBeenCalledTimes(1);
            expect(fetchCallCount).toBe(2);

            // Verify the retry preserved the original POST body
            expect(capturedBodies[1]).toBe(JSON.stringify(postBody));

            // Verify transparent success
            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            expect(result.data).toEqual(successBody);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
