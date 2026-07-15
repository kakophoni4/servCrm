'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Client[]>('/clients')
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  function go(id: string) {
    router.push(`/clients/${id}`);
  }

  return (
    <section className="desk-panel">
      <div className="desk-panel-head">
        <h2 className="desk-panel-title">Клиенты</h2>
      </div>
      <div className="desk-panel-body">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
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
                  <div className="muted">
                    {c.ageCategory?.label ?? '—'}
                    {c.city?.name ? ` · ${c.city.name}` : ''}
                  </div>
                </td>
                <td>{c.phoneNormalized}</td>
                <td>{c._count.orders}</td>
              </tr>
            ))}
            {clients.length === 0 && !error ? (
              <tr>
                <td colSpan={3} className="muted">
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
