import { redirect } from 'next/navigation';

export default function DispatcherPayRedirectPage() {
  redirect('/manage?section=salary&who=dispatcher');
}
