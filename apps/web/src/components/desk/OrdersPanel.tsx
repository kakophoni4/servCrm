'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

export function OrdersPanel() {
  const router = useRouter();
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

  function go(id: string) {
    router.push(`/orders/${id}`);
  }

  return (
    <section className="desk-panel">
      <div className="desk-panel-head">
        <h2 className="desk-panel-title">Заявки</h2>
        <div className="desk-panel-actions">
          {isOwner ? (
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="desk-select"
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
            Новая заявка
          </Link>
        </div>
      </div>
      <div className="desk-panel-body">
        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error ? (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Статус</th>
                <th>Мастер</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="row-link"
                  role="link"
                  tabIndex={0}
                  onClick={() => go(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      go(o.id);
                    }
                  }}
                >
                  <td>
                    <strong>{o.publicId}</strong>
                    {o.isClaim ? ' ⚠' : ''}
                    <div className="muted">
                      {TYPE_LABELS[o.type] ?? o.type}
                    </div>
                  </td>
                  <td>
                    {o.client.name}
                    <div className="muted">{o.client.phoneNormalized}</div>
                    <div className="muted">
                      {SOURCE_KIND_LABELS[o.sourceKind] ?? o.sourceKind}
                      {o.sourceOur
                        ? ` / ${SOURCE_OUR_LABELS[o.sourceOur] ?? o.sourceOur}`
                        : ''}
                    </div>
                  </td>
                  <td>
                    <span className="badge">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                    <div className="muted">
                      {o.scheduledAt
                        ? new Date(o.scheduledAt).toLocaleString('ru-RU')
                        : 'не назначено'}
                    </div>
                  </td>
                  <td>{o.master?.user.fullName ?? '—'}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Заявок пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
