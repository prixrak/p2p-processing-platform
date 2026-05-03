import { redirect } from 'next/navigation';

export default function OwnerBanksRedirectPage() {
  redirect('/owner/catalog?tab=banks');
}
