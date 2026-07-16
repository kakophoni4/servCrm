import { redirect } from 'next/navigation';

export default function UsersPage() {
  redirect('/settings/cities?tab=crm&section=users');
}
