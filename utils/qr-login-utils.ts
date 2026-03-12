/**
 * Extracts a login_code from QR data.
 * The QR may contain:
 *  - Plain text login code
 *  - JSON with a `loginCode` field
 * Returns the code string or null if invalid.
 */
export function extractLoginCode(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed) return null;

  // Try JSON parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.loginCode === 'string') {
      return parsed.loginCode.trim() || null;
    }
  } catch {
    // Not JSON — treat as plain text
  }

  // Plain text: return as-is if non-empty
  return trimmed || null;
}
