import { redirect } from 'next/navigation';

export default function MastersPage() {
  redirect('/manage?section=users');
}