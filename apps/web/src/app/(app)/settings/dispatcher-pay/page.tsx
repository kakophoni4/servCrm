import { redirect } from 'next/navigation';

export default function DispatcherPayRedirectPage() {
  redirect('/settings/cities?tab=crm&section=salary&who=dispatcher');
}
