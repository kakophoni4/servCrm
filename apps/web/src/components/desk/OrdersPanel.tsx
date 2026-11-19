'use client';

import styles from './DeskLists.module.css';
import {isOverdueUnassigned} from '@/lib/unassigned-order';
import {TECH} from '@/components/TechPicker';

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
    timeZone:'Europe/Samara',day: '2-digit',
    month: '2-digit',
  });
  const time = d.toLocaleTimeString('ru-RU', {
    timeZone:'Europe/Samara',hour: '2-digit',
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
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const user = getStoredUser();
  const canRead = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'orders.read',
  );

  useEffect(()=>{
    if(!canRead){setLoading(false);return}
    const c=new AbortController();let running=false;
    setLoading(true);setError('');setOrders([]);
    async function load(){
      if(running||c.signal.aborted)return;running=true;
      const q=new URLSearchParams({q:query,filter:view,tech,page:String(page),limit:'30'});
      try {const r=await api<{items:OrderRow[];total:number;totalPages:number}>(`/orders/paged?${q}`,{signal:c.signal});if(!c.signal.aborted){setOrders(r.items);setTotal(r.total);setTotalPages(r.totalPages);setNow(Date.now());setError('');if(page>r.totalPages&&r.totalPages>0)setPage(r.totalPages)}}
      catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Не удалось обновить заявки')}
      finally{running=false;if(!c.signal.aborted)setLoading(false)}
    }
    const timer=setTimeout(load,250),refresh=setInterval(()=>{if(!document.hidden)void load()},30000);
    const resume=()=>{if(!document.hidden){setNow(Date.now());void load()}};
    document.addEventListener('visibilitychange',resume);
    return()=>{clearTimeout(timer);clearInterval(refresh);document.removeEventListener('visibilitychange',resume);c.abort()}
  },[canRead,query,view,tech,page]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const visible = orders;
  function go(id: string) {
    router.push(`/orders/${id}`);
  }

  return (
    <section className={`desk-panel ${styles.list} ${styles.orders}`}>
      <div className="desk-panel-body"><div className={`field ${styles.filters}`}><input aria-label="Поиск заявок" placeholder="Поиск по заявкам" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/><div className={styles.orderFilters} role="group" aria-label="Показать заявки">{[['today','Сегодня'],['tomorrow','Завтра'],['all','Все'],['unassigned','Без мастера'],['active','В работе'],['personal','Личные'],['center','СЦ'],['sd','СД'],['closed','Закрытые'],['cancelled','Отменённые']].map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>{setView(value);setPage(1)}}>{label}</button>)}</div><label htmlFor="orders-tech">Техника</label><select id="orders-tech" value={tech} onChange={e=>{setTech(e.target.value);setPage(1)}}><option value="">Вся техника</option>{TECH.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}</select></div>
        {loading ? <p className="muted">Загрузка…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error ? (
          <>
          <p className="muted">Найдено: {total}</p>
          <div className={styles.mobileOrders}>
            {visible.map(o => {
              const urgent = isOverdueUnassigned(o, now);
              return <Link key={o.id} href={`/orders/${o.id}`} style={['today','tomorrow'].includes(view)&&['DONE','REFUSAL','CANCELLED_CC'].includes(o.status)?{opacity:0.55}:undefined} className={`${styles.orderCard}${urgent ? ` ${styles.urgentCard}` : ''}`}>
                <div className={styles.orderHeading}>
                  <strong>{o.client.name}</strong>
                  <span className={statusBadgeClass(o.status)}>{STATUS_LABELS[o.status] ?? o.status}</span>
                </div>
                <SdDeadline status={o.status} from={o.sdDueFrom} due={o.sdDueAt}/><div className={styles.orderAddress}>{o.isServiceCenter ? 'Привезут в СЦ' : o.address || 'Адрес не указан'}</div>
                <div className={styles.orderSchedule}>
                  <span>{o.scheduledAt ? formatSchedule(o.scheduledAt) : 'Время не назначено'}</span>
                  <span className={`${styles.orderMaster}${urgent?` ${styles.unassignedAlert}`:''}`} title={urgent?'Мастер не назначен больше 5 минут':undefined}>{o.isPersonal || (o.isServiceCenter&&!o.master) ? 'Выполняю сам' : o.master?.user.fullName ? `Мастер: ${o.master.user.fullName}` : 'Без мастера'}</span>
                </div>
                <div className={styles.orderFoot}>
                  <span>№ {o.publicId}</span>{o.typeTech&&<span>{o.typeTech}</span>}
                  <span>{formatRuPhoneDisplay(o.client.phoneNormalized)}</span>

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
                  const urgent = isOverdueUnassigned(o, now);
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
                      style={['today','tomorrow'].includes(view)&&['DONE','REFUSAL','CANCELLED_CC'].includes(o.status)?{opacity:0.55}:undefined}
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
                              <span className="desk-cell-sub">Больше 5 мин. без мастера</span>
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
                          <span className={urgent?styles.unassignedAlert:'desk-cell-sub'} title={urgent?'Мастер не назначен больше 5 минут':undefined}>{o.isPersonal||o.isServiceCenter?'Выполняю сам':'Без мастера'}</span>
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
          <nav className={styles.pagination} aria-label="Страницы заявок"><button className="btn secondary" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Назад</button><span>Страница {page} из {Math.max(1,totalPages)}</span><button className="btn secondary" disabled={loading||page>=totalPages} onClick={()=>setPage(p=>p+1)}>Далее</button></nav>
          </>
        ) : null}
      </div>
    </section>
  );
}
