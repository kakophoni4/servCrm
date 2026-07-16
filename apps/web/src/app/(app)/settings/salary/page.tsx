import { redirect } from 'next/navigation';

export default function SalarySettingsPage() {
  redirect('/manage?section=salary');
}
