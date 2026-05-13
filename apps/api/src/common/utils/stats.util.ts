/**
 * Statistics helpers shared across cabinet/admin services. Both UTC-day enumeration
 * and the lowercase aggregation are needed wherever we collapse Prisma `_count` rows
 * into a `Record<status, total>` bucket payload for analytics endpoints.
 */

export function enumerateDaysUTC(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function statusRecordToLowercase(
  rows: Array<{ status: string; _count: { _all: number } }>,
): Record<string, number> {
  const rec: Record<string, number> = {};
  for (const r of rows) {
    rec[r.status.toLowerCase()] = r._count._all;
  }
  return rec;
}

/** RFC 4180-compatible quoting for CSV cells (used by Pay-Out specialist CSV export). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
