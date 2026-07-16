'use client';

import { AccountSettingsPanel } from '@/components/settings/AccountSettingsPanel';

export default function AccountSettingsPage() {
  return (
    <div>
      <h1 className="page-title">Аккаунт</h1>
      <AccountSettingsPanel />
    </div>
  );
}
