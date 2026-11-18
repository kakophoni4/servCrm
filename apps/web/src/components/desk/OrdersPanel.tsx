'use client';

import styles from './DeskLists.module.css';
import {TECH} from '@/components/TechPicker';
import {isScheduledToday} from '@/lib/order-date';

import Link from 'next/link';
import { SdDeadline } from '@/components/SdDeadline';
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
  typeTech?: string | null;
  sdDueFrom?: string | null;
  sdDueAt?: string | null;
  isPersonal?: boolean;
  isServiceCenter?: boolean;
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
  if (status === 'WAITING') return `badge ${styles.waitingBadge}`;
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
  const [view,setView]=useState('today');
  const [query,setQuery]=useState('');
  const [tech,setTech]=useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [, setCities] = useState<City[]>([]);
  const [cityFilter] = useState('');
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

  const search=query.trim().toLowerCase();
  const phoneSearch=query.replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7');
  const visible = orders.filter(o=>{const closed=['DONE','REFUSAL','CANCELLED_CC'].includes(o.status);return (!tech || (tech==='Другое' ? Boolean(o.typeTech)&&!TECH.some(([code])=>code!=='Другое'&&code===o.typeTech) : o.typeTech===tech))&&(view==='all'||(view==='today'&&isScheduledToday(o.scheduledAt,now))||(view==='personal'&&o.isPersonal)||(view==='center'&&o.isServiceCenter)||(view==='active'&&!closed)||(view==='unassigned'&&!closed&&!o.master)||(view==='closed'&&o.status==='DONE')||(view==='cancelled'&&['REFUSAL','CANCELLED_CC'].includes(o.status)))&&([o.publicId,o.client.name,o.client.phoneNormalized,o.address,o.master?.user.fullName].join(' ').toLowerCase().includes(search)||(phoneSearch.length>=3&&o.client.phoneNormalized.includes(phoneSearch)))}).sort((a,b)=>view==='today'?new Date(a.scheduledAt!).getTime()-new Date(b.scheduledAt!).getTime():0);
  function go(id: string) {
    router.push(`/orders/${id}`);
  }

  return (
    <section className={`desk-panel ${styles.list} ${styles.orders}`}>
      <div className="desk-panel-head">
        <div className="desk-panel-actions desk-panel-actions-end">
          {canWrite ? (
            <Link className="btn" href="/orders/new">
              Новая заявка
            </Link>
          ) : null}
        </div>
      </div>
      <div className="desk-panel-body"><div className={`field ${styles.filters}`}><input aria-label="Поиск заявок" placeholder="Поиск по заявкам" value={query} onChange={e=>setQuery(e.target.value)}/><div className={styles.orderFilters} role="group" aria-label="Показать заявки">{[['today','Сегодня'],['all','Все'],['unassigned','Без мастера'],['active','В работе'],['personal','Личные'],['center','СЦ'],['closed','Закрытые'],['cancelled','Отменённые']].map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div><label htmlFor="orders-tech">Техника</label><select id="orders-tech" value={tech} onChange={e=>setTech(e.target.value)}><option value="">Вся техника</option>{TECH.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}</select></div>
        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && !user?.cityId && !isOwner ? (
          <p className="error">
            Филиал не назначен - список заявок пуст. Укажите филиал сотруднику в
            Управление CRM → Сотрудники.
          </p>
        ) : null}
        {!loading && !error ? (
          <>
          <p className="muted">Найдено: {visible.length}</p>
          <div className={styles.mobileOrders}>
            {visible.map(o => {
              const urgent = isUrgentUnassigned(o, now);
              return <Link key={o.id} href={`/orders/${o.id}`} className={`${styles.orderCard}${urgent ? ` ${styles.urgentCard}` : ''}`}>
                <div className={styles.orderHeading}>
                  <strong>{o.client.name}</strong>
                  <span className={statusBadgeClass(o.status)}>{STATUS_LABELS[o.status] ?? o.status}</span>
                </div>
                <SdDeadline status={o.status} from={o.sdDueFrom} due={o.sdDueAt}/><div className={styles.orderAddress}>{o.isServiceCenter ? 'Привезут в СЦ' : o.address || 'Адрес не указан'}</div>
                <div className={styles.orderSchedule}>
                  <span>{o.scheduledAt ? formatSchedule(o.scheduledAt) : 'Время не назначено'}</span>
                  <span className={styles.orderMaster}>{o.isPersonal ? 'Выполняю сам' : o.master?.user.fullName ? `Мастер: ${o.master.user.fullName}` : 'Без мастера'}</span>
                </div>
                <div className={styles.orderFoot}>
                  <span>№ {o.publicId}</span>{o.typeTech&&<span>{o.typeTech}</span>}
                  <span>{formatRuPhoneDisplay(o.client.phoneNormalized)}</span>
                  {urgent && <span className="urgent-pill">срочно</span>}
                  {o.isClaim && <span className="badge badge-warn">претензия</span>}
                  {o.type === 'WARRANTY' && <span className="badge">Гарантия</span>}
                </div>
              </Link>;
            })}
            {!visible.length && <p className={styles.orderEmpty}>Нет заявок по выбранным условиям.</p>}
          </div>
          <div className={`table-scroll ${styles.desktopOrders}`}>
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
                {visible.map((o) => {
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
                      <td data-label="Заявка">
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
                      <td data-label="Клиент">
                        <div className="desk-cell">
                          <div className="desk-cell-main">{o.client.name}</div>
                          <div className="desk-cell-phone">
                            {formatRuPhoneDisplay(o.client.phoneNormalized)}
                          </div>
                          <div className="desk-cell-sub">{o.address || source}</div>
                        </div>
                      </td>
                      <td className="desk-col-center" data-label="Время">
                        <SdDeadline status={o.status} from={o.sdDueFrom} due={o.sdDueAt}/>
                        {o.scheduledAt ? (
                          <span className="desk-time">
                            {formatSchedule(o.scheduledAt)}
                          </span>
                        ) : (
                          <span className="desk-cell-sub">не назначено</span>
                        )}
                      </td>
                      <td className="desk-col-center" data-label="Статус">
                        <span className={statusBadgeClass(o.status)}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className="desk-col-center" data-label="Мастер">
                        {o.master?.user.fullName ? (
                          <span className="desk-cell-main">
                            {o.master.user.fullName}
                          </span>
                        ) : (
                          <span className="desk-cell-sub">Не назначен</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted desk-col-center">
                      {'Нет заявок по выбранным условиям.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
