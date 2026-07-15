'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Client = {
  id: string;
  name: string;
  phoneNormalized: string;
  branchComment?: string | null;
  ageCategory?: { label: string } | null;
  city?: { name: string } | null;
  _count: { orders: number };
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Client[]>('/clients')
      .then(setClients)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  return (
    <div>
      <h1 className="page-title">Клиенты</h1>
      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Телефон</th>
              <th>Возраст</th>
              <th>Город</th>
              <th>Заявок</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/clients/${c.id}`}>
                    <strong>{c.name}</strong>
                  </Link>
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
    </div>
  );
}
