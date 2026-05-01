/** Short, UI-safe summary of audit payload values (no large JSON blocks). */
export function summarizeAuditValue(v: unknown, maxLen = 120): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > maxLen ? `${v.slice(0, maxLen - 1)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
  } catch {
    return '—';
  }
}

export function humanizeFieldKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatAuditFieldValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return summarizeAuditValue(v, 320);
}
