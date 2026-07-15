import { redirect } from 'next/navigation';

export default function DispatcherPayrollPage() {
  redirect('/settlements?tab=dispatcher');
}
