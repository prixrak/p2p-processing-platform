import type { OpsAlertSeverity } from '@p2p/config';

const RANK: Record<OpsAlertSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export function opsSeverityMeetsMinimum(
  severity: OpsAlertSeverity,
  min: OpsAlertSeverity,
): boolean {
  return RANK[severity] >= RANK[min];
}
