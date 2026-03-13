/**
 * Feature: app-persistence-fixes, Property 1: Round-trip token storage/restore
 *
 * For any valid JWT payload (userId, username, role) stored in SecureStore,
 * restoring and decoding the token must produce the same identity (userId,
 * username, role) as the original payload.
 *
 * Validates: Requirements 1.1, 1.4
 */

import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Replicate the storage helper from auth-context (in-memory mock for tests)
// ---------------------------------------------------------------------------
function createMockStorage(): {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
} {
  const store = new Map<string, string>();
  return {
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async deleteItem(key) {
      store.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Replicate decodeJwtPayload exactly as in auth-context.tsx
// ---------------------------------------------------------------------------
interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

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

// ---------------------------------------------------------------------------
// Helper: build a JWT-like token from a payload object
// ---------------------------------------------------------------------------
function base64Url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  // btoa works in Node 16+ and in the Jest/ts-jest environment
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildJwt(payload: {
  userId: number;
  username: string;
  role: string;
  iat: number;
  exp: number;
}): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload as unknown as Record<string, unknown>);
  const signature = base64Url({ sig: 'mock' });
  return `${header}.${body}.${signature}`;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'auth_token';

const roleArb = fc.constantFrom('admin', 'leader', 'employee');

const jwtPayloadArb = fc.record({
  userId: fc.integer({ min: 1, max: 1_000_000 }),
  username: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
    // Ensure the username is non-empty after trimming and doesn't break JSON
    const trimmed = s.trim();
    return trimmed.length > 0;
  }),
  role: roleArb,
});

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------
describe('Property 1: Round-trip token storage/restore', () => {
  it(
    'stores a JWT in mock SecureStore, restores it, and decodes the same userId, username, and role',
    async () => {
      await fc.assert(
        fc.asyncProperty(jwtPayloadArb, async ({ userId, username, role }) => {
          const storage = createMockStorage();

          // Build a JWT with a future expiration
          const now = Math.floor(Date.now() / 1000);
          const token = buildJwt({
            userId,
            username,
            role,
            iat: now,
            exp: now + 86400, // 24 h in the future
          });

          // --- Store (mirrors setAuthState in auth-context) ---
          await storage.setItem(TOKEN_KEY, token);

          // --- Restore (mirrors the useEffect restore logic) ---
          const storedToken = await storage.getItem(TOKEN_KEY);
          expect(storedToken).not.toBeNull();

          const decoded = decodeJwtPayload(storedToken!);
          expect(decoded).not.toBeNull();

          // --- Verify identity is preserved ---
          expect(decoded!.userId).toBe(userId);
          expect(decoded!.username).toBe(username);
          expect(decoded!.role).toBe(role);
        }),
        { numRuns: 100 },
      );
    },
  );
});
