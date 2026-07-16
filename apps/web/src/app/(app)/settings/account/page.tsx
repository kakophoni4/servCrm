'use client';

import { AccountSettingsPanel } from '@/components/settings/AccountSettingsPanel';

export default function AccountSettingsPage() {
  return (
    <div className="settings-page account-page">
      <h1 className="page-title settings-page-title">Аккаунт</h1>
      <AccountSettingsPanel />
    </div>
  );
}
