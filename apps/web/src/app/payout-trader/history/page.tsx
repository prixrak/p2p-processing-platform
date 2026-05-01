import { redirect } from 'next/navigation';

/** Old path kept so bookmarks still open the History tab on Pay-Out. */
export default function PayoutTraderHistoryPage() {
  redirect('/payout-trader/payout?tab=history');
}
