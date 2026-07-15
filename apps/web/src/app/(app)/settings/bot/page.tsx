import { redirect } from 'next/navigation';

export default function BotSettingsPage() {
  redirect('/settings/cities?tab=bot');
}
