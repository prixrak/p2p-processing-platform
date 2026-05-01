import { redirect } from 'next/navigation';

export default function MerchantsRedirectPage() {
  redirect('/owner/users');
}
