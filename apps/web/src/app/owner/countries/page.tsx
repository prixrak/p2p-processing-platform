import { redirect } from 'next/navigation';

export default function OwnerCountriesRedirectPage() {
  redirect('/owner/catalog?tab=countries');
}
