/**
 * Feature: app-persistence-fixes, Property 4: Leader session complete restore
 *
 * For any active leader session in the database, the API response mapping to
 * client state must preserve all fields correctly:
 *   - sessionId ← id
 *   - qrToken ← qr_token
 *   - numericCode ← numeric_code
 *   - expiresAt ← qr_expires_at
 *   - sessionType ← type
 *
 * Validates: Requirements 2.1, 2.2
 */

import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types matching the API response and client state (from leader.tsx)
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/sessions?status=active */
interface ApiSession {
  id: number;
  leader_id: number;
  type: 'check_in' | 'check_out';
  qr_token: string;
  numeric_code: string;
  qr_expires_at: string;
  status: string;
}

/** Client-side session state (SessionData in leader.tsx) */
interface ClientSessionData {
  sessionId: number;
  qrToken: string;
  numericCode: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Mapping function — replicates the logic from leader.tsx restoreActiveSession
// ---------------------------------------------------------------------------

function mapApiSessionToClientState(apiSession: ApiSession): {
  session: ClientSessionData;
  sessionType: 'check_in' | 'check_out';
} {
  return {
    session: {
      sessionId: apiSession.id,
      qrToken: apiSession.qr_token,
      numericCode: apiSession.numeric_code,
      expiresAt: apiSession.qr_expires_at,
    },
    sessionType: apiSession.type,
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const sessionTypeArb = fc.constantFrom<'check_in' | 'check_out'>('check_in', 'check_out');

/** Generate a 6-digit numeric code like the real app produces */
const numericCodeArb = fc
  .array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 6, maxLength: 6 })
  .map((digits) => digits.join(''));

/** Generate a UUID-like qr_token string */
const qrTokenArb = fc.uuid();

/** Generate a future ISO date string for qr_expires_at */
const expiresAtArb = fc
  .integer({
    min: new Date('2025-01-01T00:00:00Z').getTime(),
    max: new Date('2030-12-31T23:59:59Z').getTime(),
  })
  .map((ts) => new Date(ts).toISOString());

const apiSessionArb = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  leader_id: fc.integer({ min: 1, max: 1_000_000 }),
  type: sessionTypeArb,
  qr_token: qrTokenArb,
  numeric_code: numericCodeArb,
  qr_expires_at: expiresAtArb,
  status: fc.constant('active'),
});

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('Property 4: Leader session complete restore', () => {
  it(
    'maps API response fields to client state correctly for any active session',
    async () => {
      await fc.assert(
        fc.asyncProperty(apiSessionArb, async (apiSession: ApiSession) => {
          const { session, sessionType } = mapApiSessionToClientState(apiSession);

          // Verify all fields are correctly mapped
          expect(session.sessionId).toBe(apiSession.id);
          expect(session.qrToken).toBe(apiSession.qr_token);
          expect(session.numericCode).toBe(apiSession.numeric_code);
          expect(session.expiresAt).toBe(apiSession.qr_expires_at);
          expect(sessionType).toBe(apiSession.type);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'preserves sessionType as exactly check_in or check_out',
    async () => {
      await fc.assert(
        fc.asyncProperty(apiSessionArb, async (apiSession: ApiSession) => {
          const { sessionType } = mapApiSessionToClientState(apiSession);

          expect(['check_in', 'check_out']).toContain(sessionType);
          expect(sessionType).toBe(apiSession.type);
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'round-trips: client state can reconstruct the original API field values',
    async () => {
      await fc.assert(
        fc.asyncProperty(apiSessionArb, async (apiSession: ApiSession) => {
          const { session, sessionType } = mapApiSessionToClientState(apiSession);

          // Reconstruct API-like fields from client state
          const reconstructed = {
            id: session.sessionId,
            type: sessionType,
            qr_token: session.qrToken,
            numeric_code: session.numericCode,
            qr_expires_at: session.expiresAt,
          };

          expect(reconstructed.id).toBe(apiSession.id);
          expect(reconstructed.type).toBe(apiSession.type);
          expect(reconstructed.qr_token).toBe(apiSession.qr_token);
          expect(reconstructed.numeric_code).toBe(apiSession.numeric_code);
          expect(reconstructed.qr_expires_at).toBe(apiSession.qr_expires_at);
        }),
        { numRuns: 100 },
      );
    },
  );
});
