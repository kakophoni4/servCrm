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
import { hasPermission } from '@/lib/permissions';

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

const URGENT_MS = 30 * 60 * 1000;

function isUrgentUnassigned(o: OrderRow, now: number): boolean {
  if (o.master) return false;
  if (!o.scheduledAt) return false;
  if (['DONE', 'REFUSAL', 'CANCELLED_CC'].includes(o.status)) return false;
  const t = new Date(o.scheduledAt).getTime();
  if (Number.isNaN(t)) return false;
  return t - now <= URGENT_MS;
}

export function OrdersPanel() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const user = getStoredUser();
  const isOwner = (user?.role ?? '') === 'OWNER';
  const canWrite = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'orders.write',
  );
  const canRead = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'orders.read',
  );

  useEffect(() => {
    if (!isOwner) return;
    api<City[]>('/cities')
      .then(setCities)
      .catch(() => setCities([]));
  }, [isOwner]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      setOrders([]);
      return;
    }
    setLoading(true);
    setError('');
    const q = cityFilter ? `?cityId=${cityFilter}` : '';
    api<OrderRow[]>(`/orders${q}`)
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setLoading(false));
  }, [cityFilter, canRead]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  function go(id: string) {
    router.push(`/orders/${id}`);
  }

  return (
    <section className="desk-panel">
      <div className="desk-panel-head">
        <div className="desk-panel-actions desk-panel-actions-end">
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
          {canWrite ? (
            <Link className="btn" href="/orders/new">
              Новая заявка
            </Link>
          ) : null}
        </div>
      </div>
      <div className="desk-panel-body">
        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && !user?.cityId && !isOwner ? (
          <p className="error">
            Филиал не назначен — список заявок пуст. Укажите филиал сотруднику в
            Настройки → Управление CRM.
          </p>
        ) : null}
        {!loading && !error ? (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Клиент</th>
                <th>Время</th>
                <th>Статус</th>
                <th>Мастер</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const urgent = isUrgentUnassigned(o, now);
                return (
                  <tr
                    key={o.id}
                    className={
                      urgent ? 'row-link row-urgent' : 'row-link'
                    }
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
                      {urgent ? (
                        <span className="urgent-pill">срочно</span>
                      ) : null}
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
                      {o.scheduledAt ? (
                        <strong>
                          {new Date(o.scheduledAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                      ) : (
                        <span className="muted">не назначено</span>
                      )}
                    </td>
                    <td>
                      <span className="badge">
                        {STATUS_LABELS[o.status] ?? o.status}
                      </span>
                    </td>
                    <td>{o.master?.user.fullName ?? '—'}</td>
                  </tr>
                );
              })}
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    {user?.cityName
                      ? `В филиале «${user.cityName}» заявок пока нет.`
                      : 'Заявок пока нет.'}
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
