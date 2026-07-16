import { redirect } from 'next/navigation';

export default function SettlementsPage() {
  redirect('/manage?section=settlements');
}
