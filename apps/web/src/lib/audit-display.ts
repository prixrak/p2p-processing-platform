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

/** Prisma relation shapes often embedded in audited responses — hide from flat field listings. */
const AUDIT_RELATION_KEYS = new Set(['bank', 'group', 'trader', 'currency']);

/**
 * Normalize audit JSON payloads for side‑by‑side display (drops included relations).
 * Non-objects are wrapped as `{ value: … }` so callers always get a record or null.
 */
export function sanitizeAuditSnapshotForDisplay(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    return { value: v as string | number | boolean };
  }
  const o = { ...(v as Record<string, unknown>) };
  for (const k of AUDIT_RELATION_KEYS) delete o[k];
  return o;
}

export type AuditFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

/** Keys whose serialized values differ between two sanitized snapshots (sorted by field name). */
export function listAuditFieldChanges(
  oldSanitized: Record<string, unknown> | null,
  newSanitized: Record<string, unknown> | null,
): AuditFieldChange[] {
  if (!oldSanitized || !newSanitized) return [];
  const keys = new Set([...Object.keys(oldSanitized), ...Object.keys(newSanitized)]);
  const out: AuditFieldChange[] = [];
  for (const field of keys) {
    const beforeVal = oldSanitized[field];
    const afterVal = newSanitized[field];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      out.push({
        field,
        label: humanizeFieldKey(field),
        before: formatAuditFieldValue(beforeVal),
        after: formatAuditFieldValue(afterVal),
      });
    }
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}
