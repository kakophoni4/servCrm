'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';

type Client = {
  id: string;
  name: string;
  phoneNormalized: string;
  branchComment?: string | null;
  ageCategory?: { label: string } | null;
  city?: { name: string } | null;
  orders: Array<{
    id: string;
    publicId: string;
    status: string;
    type: string;
    address: string;
    createdAt: string;
    isClaim: boolean;
    payment?: { paid: string | number; workSum: string | number } | null;
  }>;
};

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Client>(`/clients/${id}`)
      .then(setClient)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [id]);

  function goOrder(orderId: string) {
    router.push(`/orders/${orderId}`);
  }

  if (!client) {
    return (
      <div className="panel">
        {error ? <p className="error">{error}</p> : <p className="muted">Загрузка…</p>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">{client.name}</h1>
      <div className="panel" style={{ marginBottom: 16 }}>
        <p>
          Телефон: <strong>{client.phoneNormalized}</strong>
        </p>
        <p className="muted">
          {client.ageCategory?.label ?? 'возраст не указан'}
          {client.city ? ` · ${client.city.name}` : ''}
        </p>
        {client.branchComment ? (
          <p>Комментарий филиала: {client.branchComment}</p>
        ) : null}
      </div>
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>История заказов</h2>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Адрес</th>
              <th>Оплачено</th>
              <th>Сумма работ</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {client.orders.map((o) => (
              <tr
                key={o.id}
                className="row-link"
                role="link"
                tabIndex={0}
                onClick={() => goOrder(o.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goOrder(o.id);
                  }
                }}
              >
                <td>
                  <strong>{o.publicId}</strong>
                  {o.isClaim ? ' ⚠' : ''}
                </td>
                <td>{TYPE_LABELS[o.type]}</td>
                <td>{STATUS_LABELS[o.status]}</td>
                <td>{o.address}</td>
                <td>{o.payment ? `${String(o.payment.paid)} ₽` : '—'}</td>
                <td>{o.payment ? `${String(o.payment.workSum)} ₽` : '—'}</td>
                <td>{new Date(o.createdAt).toLocaleString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
