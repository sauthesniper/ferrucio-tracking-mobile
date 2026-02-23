/**
 * Utility functions for formatting and validating numeric codes
 * used in the manual QR input flow (format: 123-456).
 */

/**
 * Formats a raw input string into the numeric code display format (XXX-XXX).
 * - Strips all non-digit characters
 * - Caps at 6 digits
 * - Inserts a hyphen after the 3rd digit
 */
export function formatNumericCode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/**
 * Returns true when the input contains exactly 6 digit characters,
 * ignoring any formatting (hyphens, spaces, etc.).
 */
export function isCompleteCode(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 6;
}

/**
 * Removes hyphens from a formatted code for API submission.
 */
export function stripCodeFormatting(formatted: string): string {
  return formatted.replace(/-/g, '');
}
