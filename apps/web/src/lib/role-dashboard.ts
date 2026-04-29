import { UserRole } from '@p2p/shared';

const ROLE_DASHBOARD: Record<string, string> = {
  [UserRole.TRADER]: '/trader',
  [UserRole.PAYOUT_TRADER]: '/payout-trader',
  [UserRole.ADMIN]: '/admin',
  [UserRole.SUPPORT]: '/support',
  [UserRole.MERCHANT]: '/merchant',
  [UserRole.OWNER]: '/owner',
  [UserRole.REFERRAL]: '/referral',
};

export function getDashboardPathForRole(role: string): string {
  return ROLE_DASHBOARD[role] ?? '/trader';
}
