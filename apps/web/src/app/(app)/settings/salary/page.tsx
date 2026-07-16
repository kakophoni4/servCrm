import { redirect } from 'next/navigation';

export default function SalarySettingsPage() {
  redirect('/settings/cities?tab=crm&section=salary');
}
