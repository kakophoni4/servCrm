'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { formatRuPhoneDisplay } from '@/lib/phone';
import { hasPermission } from '@/lib/permissions';

type Client = {
  id: string;
  name: string;
  phoneNormalized: string;
  ageCategory?: { label: string } | null;
  city?: { name: string } | null;
  _count: { orders: number };
};

export function ClientsPanel() {
  const router = useRouter();
  const user = getStoredUser();
  const canRead = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'clients.read',
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRead) return;
    api<Client[]>('/clients')
      .then(setClients)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Ошибка';
        if (msg !== 'Недостаточно прав') setError(msg);
      });
  }, [canRead]);

  function go(id: string) {
    router.push(`/clients/${id}`);
  }

  if (!canRead) return null;

  return (
    <section className="desk-panel">
      <div className="desk-panel-body">
        {error ? <p className="error">{error}</p> : null}
        <div className="table-scroll">
          <table className="table desk-list">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th className="desk-col-center">Возраст</th>
                <th className="desk-col-center">Филиал</th>
                <th className="desk-col-center">Заявок</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="row-link"
                  role="link"
                  tabIndex={0}
                  onClick={() => go(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      go(c.id);
                    }
                  }}
                >
                  <td>
                    <div className="desk-cell">
                      <div className="desk-cell-main">{c.name}</div>
                    </div>
                  </td>
                  <td>
                    <span className="desk-cell-phone">
                      {formatRuPhoneDisplay(c.phoneNormalized)}
                    </span>
                  </td>
                  <td className="desk-col-center">
                    {c.ageCategory?.label ? (
                      <span className="desk-cell-main">{c.ageCategory.label}</span>
                    ) : (
                      <span className="desk-cell-sub">—</span>
                    )}
                  </td>
                  <td className="desk-col-center">
                    {c.city?.name ? (
                      <span className="desk-cell-main">{c.city.name}</span>
                    ) : (
                      <span className="desk-cell-sub">—</span>
                    )}
                  </td>
                  <td className="desk-col-center">
                    <span className="desk-count">{c._count.orders}</span>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && !error ? (
                <tr>
                  <td colSpan={5} className="muted desk-col-center">
                    Клиентов пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
