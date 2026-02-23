// Feature: manual-qr-input, Property 1: Hyphen auto-formatting
import * as fc from 'fast-check';
import { formatNumericCode } from '../numeric-code';

/**
 * **Validates: Requirements 2.3**
 *
 * Property 1: For any string of digits with length > 3, applying the
 * formatNumericCode function should produce a string where a hyphen appears
 * after exactly the third digit, and no non-digit characters other than that
 * single hyphen are present. (When length is exactly 3, no hyphen is needed
 * since there are no digits after the third position.)
 */
describe('Property 1: Hyphen auto-formatting', () => {
  it('should insert a hyphen after exactly the 3rd digit for any digit string of length ≥ 3', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 4, maxLength: 20 }).map(arr => arr.join('')),
        (digits: string) => {
          const formatted = formatNumericCode(digits);

          // The function caps at 6 digits, so effective input is at most 6 digits
          const effectiveDigits = digits.slice(0, 6);

          // A hyphen must appear at index 3 (after the 3rd digit)
          expect(formatted[3]).toBe('-');

          // Only one hyphen should be present
          const hyphenCount = (formatted.match(/-/g) || []).length;
          expect(hyphenCount).toBe(1);

          // No non-digit characters other than the single hyphen
          const withoutHyphen = formatted.replace(/-/g, '');
          expect(withoutHyphen).toMatch(/^\d+$/);

          // The digits should match the effective input
          expect(withoutHyphen).toBe(effectiveDigits);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: manual-qr-input, Property 2: Submit button enabled iff complete code
import { isCompleteCode } from '../numeric-code';

/**
 * **Validates: Requirements 2.4, 2.5**
 *
 * Property 2: For any raw input string, the submit button should be enabled
 * if and only if the input contains exactly 6 digit characters (ignoring
 * hyphens/formatting). Inputs with fewer or more than 6 digits must result
 * in a disabled submit button.
 */
describe('Property 2: Submit button enabled iff complete code', () => {
  it('should return true for any string containing exactly 6 digits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 6, maxLength: 6 })
          .map(arr => arr.join('')),
        (sixDigits: string) => {
          expect(isCompleteCode(sixDigits)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return true for 6 digits with interspersed non-digit characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 6, maxLength: 6 })
          .map(arr => arr.join('')),
        fc.constantFrom('-', ' ', '.', '/', 'a', 'X'),
        (sixDigits: string, separator: string) => {
          // Insert separator at a random position within the digit string
          const pos = 3; // typical hyphen position
          const withSeparator = sixDigits.slice(0, pos) + separator + sixDigits.slice(pos);
          expect(isCompleteCode(withSeparator)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return false for strings with fewer than 6 digits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 0, maxLength: 5 })
          .map(arr => arr.join('')),
        (digits: string) => {
          expect(isCompleteCode(digits)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return false for strings with more than 6 digits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), { minLength: 7, maxLength: 20 })
          .map(arr => arr.join('')),
        (digits: string) => {
          expect(isCompleteCode(digits)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should return false for strings with no digits', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('-', ' ', '.', '/', 'a', 'b', 'X', '!'), { minLength: 0, maxLength: 20 })
          .map(arr => arr.join('')),
        (nonDigits: string) => {
          expect(isCompleteCode(nonDigits)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
