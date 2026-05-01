import { redirect } from 'next/navigation';

export default function TradersRedirectPage() {
  redirect('/admin/users');
}
