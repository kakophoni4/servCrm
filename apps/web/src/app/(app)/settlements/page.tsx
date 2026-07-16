import { redirect } from 'next/navigation';

export default function SettlementsPage() {
  redirect('/settings/cities?tab=crm&section=settlements');
}
