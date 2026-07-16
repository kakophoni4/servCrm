import { redirect } from 'next/navigation';

export default function DispatcherPayrollPage() {
  redirect('/manage?section=settlements&who=dispatcher');
}
