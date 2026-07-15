'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStoredUser } from '@/lib/api';
import { DispatcherPayrollPanel } from '@/components/payroll/DispatcherPayrollPanel';
import { MasterSettlementsPanel } from '@/components/payroll/MasterSettlementsPanel';

type Tab = 'master' | 'dispatcher';

function SettlementsInner() {
  const role = getStoredUser()?.role ?? '';
  const canDispatchers = role === 'DIRECTOR' || role === 'OWNER';
  const search = useSearchParams();
  const router = useRouter();
  const initial: Tab =
    canDispatchers && search.get('tab') === 'dispatcher'
      ? 'dispatcher'
      : 'master';
  const [tab, setTab] = useState<Tab>(initial);

  useEffect(() => {
    const q = search.get('tab');
    if (q === 'dispatcher' && canDispatchers) setTab('dispatcher');
    else if (q === 'master') setTab('master');
  }, [search, canDispatchers]);

  function selectTab(next: Tab) {
    setTab(next);
    const qs = next === 'dispatcher' ? '?tab=dispatcher' : '';
    router.replace(`/settlements${qs}`);
  }

  return (
    <div>
      <h1 className="page-title">Расчёт</h1>

      <div className="seg-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'master' ? 'active' : ''}
          aria-selected={tab === 'master'}
          onClick={() => selectTab('master')}
        >
          Мастера
        </button>
        {canDispatchers ? (
          <button
            type="button"
            role="tab"
            className={tab === 'dispatcher' ? 'active' : ''}
            aria-selected={tab === 'dispatcher'}
            onClick={() => selectTab('dispatcher')}
          >
            Диспетчеры
          </button>
        ) : null}
      </div>

      {tab === 'master' ? (
        <MasterSettlementsPanel />
      ) : (
        <DispatcherPayrollPanel />
      )}
    </div>
  );
}

export default function SettlementsPage() {
  return (
    <Suspense fallback={<p className="muted">Загрузка…</p>}>
      <SettlementsInner />
    </Suspense>
  );
}
