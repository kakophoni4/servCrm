'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
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
        <table className="table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Возраст</th>
              <th>Филиал</th>
              <th>Заявок</th>
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
                  <strong>{c.name}</strong>
                </td>
                <td>{c.phoneNormalized}</td>
                <td>{c.ageCategory?.label ?? '—'}</td>
                <td>{c.city?.name ?? '—'}</td>
                <td>{c._count.orders}</td>
              </tr>
            ))}
            {clients.length === 0 && !error ? (
              <tr>
                <td colSpan={5} className="muted">
                  Клиентов пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
