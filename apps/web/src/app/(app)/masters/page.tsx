import { redirect } from 'next/navigation';

export default function MastersPage() {
  redirect('/settings/cities?tab=crm&section=users');
}