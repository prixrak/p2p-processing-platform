/**
 * Normalize decimal separators for parsing: trim, strip spaces, treat comma as radix point.
 */
export function normalizeDecimalSeparators(raw: string): string {
  return raw.trim().replace(/\s/g, '').replace(/,/g, '.');
}

/**
 * Restrict typing to at most one decimal separator (comma or dot → dot); strips other characters.
 */
export function sanitizePartialDecimalInput(raw: string): string {
  const withDot = raw.trim().replace(/\s/g, '').replace(/,/g, '.');
  let out = '';
  let dotSeen = false;
  for (const ch of withDot) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !dotSeen) {
      dotSeen = true;
      out += '.';
    }
  }
  return out;
}

/** Parse a user-entered decimal; empty or invalid strings yield NaN (same spirit as parseFloat). */
export function parseDecimalInput(raw: string): number {
  const n = parseFloat(normalizeDecimalSeparators(raw));
  return Number.isFinite(n) ? n : NaN;
}
