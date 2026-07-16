'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';
import { DispatcherPayrollPanel } from '@/components/payroll/DispatcherPayrollPanel';
import { MasterSettlementsPanel } from '@/components/payroll/MasterSettlementsPanel';
import { CrmUsersPanel } from '@/components/settings/CrmUsersPanel';
import { DispatcherPayPanel } from '@/components/settings/DispatcherPayPanel';
import { MasterSalaryPanel } from '@/components/settings/MasterSalaryPanel';

type Section = 'users' | 'settlements' | 'salary';
type Who = 'master' | 'dispatcher';

export function CrmManagePanel() {
  const user = getStoredUser();
  const role = user?.role ?? '';
  const perms = user?.permissions;
  const search = useSearchParams();
  const router = useRouter();

  const canUsers = hasPermission(role, perms, 'users.read');
  const canSettlements = hasPermission(role, perms, 'settlements.read');
  const canSalary = hasPermission(role, perms, [
    'salary.read',
    'settings.dispatcher_pay',
  ]);
  const canDispatchers = role === 'DIRECTOR' || role === 'OWNER';

  const sections = useMemo(() => {
    const list: { id: Section; label: string }[] = [];
    if (canUsers) list.push({ id: 'users', label: 'Сотрудники' });
    if (canSettlements) list.push({ id: 'settlements', label: 'Расчёт' });
    if (canSalary) list.push({ id: 'salary', label: 'Настройки ЗП' });
    return list;
  }, [canUsers, canSettlements, canSalary]);

  function sectionFromSearch(raw: string | null): Section {
    if (raw === 'settlements' && canSettlements) return 'settlements';
    if (raw === 'salary' && canSalary) return 'salary';
    if (raw === 'users' && canUsers) return 'users';
    return sections[0]?.id ?? 'users';
  }

  const [section, setSection] = useState<Section>(() =>
    sectionFromSearch(search.get('section')),
  );
  const [who, setWho] = useState<Who>(() =>
    search.get('who') === 'dispatcher' && canDispatchers
      ? 'dispatcher'
      : 'master',
  );

  useEffect(() => {
    setSection(sectionFromSearch(search.get('section')));
    const w = search.get('who');
    if (w === 'dispatcher' && canDispatchers) setWho('dispatcher');
    else if (w === 'master' || !w) setWho('master');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, canUsers, canSettlements, canSalary, canDispatchers, sections]);

  function go(nextSection: Section, nextWho: Who = 'master') {
    setSection(nextSection);
    setWho(nextWho);
    const q = new URLSearchParams({ section: nextSection });
    if (
      (nextSection === 'settlements' || nextSection === 'salary') &&
      nextWho === 'dispatcher'
    ) {
      q.set('who', 'dispatcher');
    }
    router.replace(`/manage?${q}`);
  }

  if (!sections.length) {
    return (
      <div className="panel">
        <p className="muted">Нет доступа к разделам управления CRM.</p>
      </div>
    );
  }

  return (
    <div className="crm-manage">
      {sections.length > 1 ? (
        <div className="seg-tabs" role="tablist">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={section === s.id ? 'active' : ''}
              aria-selected={section === s.id}
              onClick={() => go(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}

      {section === 'users' ? (
        <CrmUsersPanel />
      ) : section === 'settlements' ? (
        <div>
          <div className="seg-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={who === 'master' ? 'active' : ''}
              aria-selected={who === 'master'}
              onClick={() => go('settlements', 'master')}
            >
              Мастера
            </button>
            {canDispatchers ? (
              <button
                type="button"
                role="tab"
                className={who === 'dispatcher' ? 'active' : ''}
                aria-selected={who === 'dispatcher'}
                onClick={() => go('settlements', 'dispatcher')}
              >
                Диспетчеры
              </button>
            ) : null}
          </div>
          {who === 'master' ? (
            <MasterSettlementsPanel />
          ) : (
            <DispatcherPayrollPanel />
          )}
        </div>
      ) : (
        <div>
          <div className="seg-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={who === 'master' ? 'active' : ''}
              aria-selected={who === 'master'}
              onClick={() => go('salary', 'master')}
            >
              Мастера
            </button>
            <button
              type="button"
              role="tab"
              className={who === 'dispatcher' ? 'active' : ''}
              aria-selected={who === 'dispatcher'}
              onClick={() => go('salary', 'dispatcher')}
            >
              Диспетчеры
            </button>
          </div>
          {who === 'master' ? <MasterSalaryPanel /> : <DispatcherPayPanel />}
        </div>
      )}
    </div>
  );
}
