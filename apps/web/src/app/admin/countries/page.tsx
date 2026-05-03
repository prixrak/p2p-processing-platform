import { redirect } from 'next/navigation';

export default function AdminCountriesRedirectPage() {
  redirect('/admin/catalog?tab=countries');
}
