import { redirect } from 'next/navigation';

export default function DispatcherPayrollPage() {
  redirect('/settings/cities?tab=crm&section=settlements&who=dispatcher');
}
