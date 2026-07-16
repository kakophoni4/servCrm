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
import { formatRuPhoneDisplay } from '@/lib/phone';
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

function statusBadgeClass(status: string): string {
  if (status === 'DONE') return 'badge badge-ok';
  if (status === 'REFUSAL' || status === 'CANCELLED_CC') return 'badge badge-muted';
  if (
    status === 'IN_PROGRESS' ||
    status === 'IN_PROGRESS_SD' ||
    status === 'ON_THE_WAY'
  ) {
    return 'badge badge-work';
  }
  return 'badge';
}

function formatSchedule(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  });
  const time = d.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
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
            Управление CRM → Сотрудники.
          </p>
        ) : null}
        {!loading && !error ? (
          <div className="table-scroll">
            <table className="table desk-list">
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Клиент</th>
                  <th className="desk-col-center">Время</th>
                  <th className="desk-col-center">Статус</th>
                  <th className="desk-col-center">Мастер</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const urgent = isUrgentUnassigned(o, now);
                  const source = [
                    SOURCE_KIND_LABELS[o.sourceKind] ?? o.sourceKind,
                    o.sourceOur
                      ? (SOURCE_OUR_LABELS[o.sourceOur] ?? o.sourceOur)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
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
                        <div className="desk-cell">
                          <div className="desk-cell-top">
                            <span className="desk-id">{o.publicId}</span>
                            {urgent ? (
                              <span className="urgent-pill">срочно</span>
                            ) : null}
                            {o.isClaim ? (
                              <span className="badge badge-warn">претензия</span>
                            ) : null}
                          </div>
                          <div className="desk-cell-sub">
                            {TYPE_LABELS[o.type] ?? o.type}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="desk-cell">
                          <div className="desk-cell-main">{o.client.name}</div>
                          <div className="desk-cell-phone">
                            {formatRuPhoneDisplay(o.client.phoneNormalized)}
                          </div>
                          <div className="desk-cell-sub">{source}</div>
                        </div>
                      </td>
                      <td className="desk-col-center">
                        {o.scheduledAt ? (
                          <span className="desk-time">
                            {formatSchedule(o.scheduledAt)}
                          </span>
                        ) : (
                          <span className="desk-cell-sub">не назначено</span>
                        )}
                      </td>
                      <td className="desk-col-center">
                        <span className={statusBadgeClass(o.status)}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className="desk-col-center">
                        {o.master?.user.fullName ? (
                          <span className="desk-cell-main">
                            {o.master.user.fullName}
                          </span>
                        ) : (
                          <span className="desk-cell-sub">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted desk-col-center">
                      {user?.cityName
                        ? `В филиале «${user.cityName}» заявок пока нет.`
                        : 'Заявок пока нет.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
