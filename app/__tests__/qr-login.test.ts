import { extractLoginCode } from '../../utils/qr-login-utils';

describe('extractLoginCode', () => {
  it('returns plain text login code as-is', () => {
    expect(extractLoginCode('ABC123')).toBe('ABC123');
  });

  it('trims whitespace from plain text', () => {
    expect(extractLoginCode('  ABC123  ')).toBe('ABC123');
  });

  it('extracts loginCode from JSON object', () => {
    expect(extractLoginCode('{"loginCode":"XYZ789"}')).toBe('XYZ789');
  });

  it('trims loginCode value from JSON', () => {
    expect(extractLoginCode('{"loginCode":"  CODE1  "}')).toBe('CODE1');
  });

  it('returns null for empty string', () => {
    expect(extractLoginCode('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractLoginCode('   ')).toBeNull();
  });

  it('returns null for JSON with empty loginCode', () => {
    expect(extractLoginCode('{"loginCode":""}')).toBeNull();
  });

  it('returns null for JSON without loginCode field', () => {
    expect(extractLoginCode('{"other":"value"}')).toBe('{"other":"value"}');
  });

  it('returns null for JSON with non-string loginCode', () => {
    // loginCode is a number — not a string, so falls through to plain text
    expect(extractLoginCode('{"loginCode":123}')).toBe('{"loginCode":123}');
  });

  it('handles JSON with extra fields', () => {
    expect(extractLoginCode('{"loginCode":"CODE1","extra":"data"}')).toBe('CODE1');
  });
});
