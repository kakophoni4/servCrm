'use client';

import { Suspense } from 'react';
import { CrmManagePanel } from '@/components/settings/CrmManagePanel';

function ManageInner() {
  return (
    <div>
      <h1 className="page-title">Управление CRM</h1>
      <CrmManagePanel />
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={<p className="muted">Загрузка…</p>}>
      <ManageInner />
    </Suspense>
  );
}
