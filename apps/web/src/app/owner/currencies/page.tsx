import { redirect } from 'next/navigation';

export default function OwnerCurrenciesRedirectPage() {
  redirect('/owner/catalog?tab=currencies');
}
