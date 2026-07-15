'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import {
  SOURCE_KIND_LABELS,
  SOURCE_OUR_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/lib/labels';

type OrderRow = {
  id: string;
  publicId: string;
  status: string;
  type: string;
  sourceKind: string;
  sourceOur?: string | null;
  address: string;
  scheduledAt?: string | null;
  createdAt: string;
  isClaim: boolean;
  client: { name: string; phoneNormalized: string };
  partner?: { name: string } | null;
  master?: { user: { fullName: string } } | null;
  city?: { id: string; name: string } | null;
};

type City = { id: string; name: string };

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isOwner = (getStoredUser()?.role ?? '') === 'OWNER';

  useEffect(() => {
    if (!isOwner) return;
    api<City[]>('/cities')
      .then(setCities)
      .catch(() => setCities([]));
  }, [isOwner]);

  useEffect(() => {
    setLoading(true);
    const q = cityFilter ? `?cityId=${cityFilter}` : '';
    api<OrderRow[]>(`/orders${q}`)
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [cityFilter]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Заявки</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isOwner ? (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.7rem',
              }}
            >
              <option value="">Все филиалы</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}
          <Link className="btn" href="/orders/new">
            Создать заявку
          </Link>
        </div>
      </div>
      <div className="panel">
        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error ? (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Филиал</th>
                <th>Тип</th>
                <th>Источник</th>
                <th>Статус</th>
                <th>Мастер</th>
                <th>Когда</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/orders/${o.id}`}>
                      <strong>{o.publicId}</strong>
                      {o.isClaim ? ' ⚠' : ''}
                    </Link>
                  </td>
                  <td>
                    {o.client.name}
                    <div className="muted">{o.client.phoneNormalized}</div>
                  </td>
                  <td>{o.city?.name ?? '—'}</td>
                  <td>{TYPE_LABELS[o.type] ?? o.type}</td>
                  <td>
                    {SOURCE_KIND_LABELS[o.sourceKind] ?? o.sourceKind}
                    {o.sourceOur
                      ? ` / ${SOURCE_OUR_LABELS[o.sourceOur] ?? o.sourceOur}`
                      : ''}
                    {o.partner ? ` / ${o.partner.name}` : ''}
                  </td>
                  <td>
                    <span className="badge">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                  <td>{o.master?.user.fullName ?? '—'}</td>
                  <td>
                    {o.scheduledAt
                      ? new Date(o.scheduledAt).toLocaleString('ru-RU')
                      : 'не назначено'}
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Заявок пока нет — создайте первую.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
