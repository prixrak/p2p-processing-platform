/** Staff settlements list: operator email, or "Automatic" for worker-credited on-chain top-ups. */
export function settlementRecordedByLabel(row: {
  admin?: { email: string } | null;
  walletDeposit?: unknown | null;
}): string {
  if (row.admin?.email) return row.admin.email;
  if (row.walletDeposit) return 'Automatic';
  return '—';
}
