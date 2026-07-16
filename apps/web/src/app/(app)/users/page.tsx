import { redirect } from 'next/navigation';

export default function UsersPage() {
  redirect('/manage?section=users');
}
