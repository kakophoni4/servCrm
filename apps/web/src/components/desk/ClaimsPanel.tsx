'use client';

import styles from './DeskLists.module.css';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { formatRuPhoneDisplay } from '@/lib/phone';
import { hasPermission } from '@/lib/permissions';

const CLAIM_TYPES: Record<string, string> = {
  POLICE: 'Полиция',
  MASTER_BROKE: 'Мастер сломал технику',
  PRICE_DISSATISFIED: 'Недоволен ценой',
};

type Claim = {
  id: string;
  type: string;
  createdAt: string;
  closedAt?: string | null;
  refundSum: string | number;
  orderSum: string | number;
  order: { id: string; publicId: string; client: { name: string } };
  city?: { name: string } | null;
};

type OrderHit = {
  id: string;
  publicId: string;
  cityId?: string | null;
  client: { name: string; phoneNormalized: string };
  payment?: { paid: string | number } | null;
};

type City = { id: string; name: string };

function formatMoney(value: string | number): string {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('ru-RU');
}

export function ClaimsPanel() {
  const user = getStoredUser();
  const canRead = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'claims.read',
  );
  const canWrite = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'claims.write',
  );

  const [claims, setClaims] = useState<Claim[]>([]);
  const [query,setQuery]=useState(''),[page,setPage]=useState(1),[totalPages,setTotalPages]=useState(0),[total,setTotal]=useState(0),[openTotal,setOpenTotal]=useState(0),[revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false),[closedView,setClosedView]=useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    orderId: '',
    type: 'PRICE_DISSATISFIED',
    refundSum: '',
    cityId: '',
  });

  const [orderQuery, setOrderQuery] = useState('');
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  async function load(){setRevision(v=>v+1)}
  useEffect(()=>{if(!canWrite)return;api<City[]>('/cities').then(c=>{if(c[0])setForm(f=>({...f,cityId:f.cityId||c[0].id}))}).catch(()=>{})},[canWrite]);
  useEffect(()=>{if(!canRead)return;const c=new AbortController();setLoading(true);setError('');setClaims([]);const timer=setTimeout(()=>{api<{items:Claim[];total:number;totalPages:number;openTotal:number}>(`/claims/paged?${new URLSearchParams({q:query,filter:closedView?'closed':'open',page:String(page),limit:'30'})}`,{signal:c.signal}).then(r=>{if(!c.signal.aborted){setClaims(r.items);setTotal(r.total);setTotalPages(r.totalPages);setOpenTotal(r.openTotal);if(page>r.totalPages&&page>1)setPage(Math.max(1,r.totalPages))}}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})},250);return()=>{clearTimeout(timer);c.abort()}},[canRead,query,closedView,page,revision]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!searchBoxRef.current?.contains(e.target as Node)) {
        setShowHits(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (selectedOrder) return;
    const q = orderQuery.trim();
    if (q.length < 2) {
      setOrderHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      api<OrderHit[]>(`/orders/search?q=${encodeURIComponent(q)}`)
        .then((hits) => {
          setOrderHits(hits);
          setShowHits(true);
        })
        .catch(() => setOrderHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [orderQuery, selectedOrder]);

  function pickOrder(o: OrderHit) {
    setSelectedOrder(o);
    setForm((f) => ({
      ...f,
      orderId: o.id,
      cityId: o.cityId || f.cityId,
    }));
    setOrderQuery('');
    setOrderHits([]);
    setShowHits(false);
  }

  function clearOrder() {
    setSelectedOrder(null);
    setForm((f) => ({ ...f, orderId: '' }));
    setOrderQuery('');
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.orderId) {
      setError('Выберите заявку из подсказок');
      return;
    }
    try {
      await api('/claims', {
        method: 'POST',
        body: JSON.stringify({
          orderId: form.orderId,
          type: form.type,
          refundSum: Number(form.refundSum),
          cityId: form.cityId || undefined,
        }),
      });
      clearOrder();
      setShowForm(false);
      setForm((f) => ({
        ...f,
        type: 'PRICE_DISSATISFIED',
        refundSum: '',
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function closeClaim(id: string) {
    await api(`/claims/${id}/close`, { method: 'PATCH', body: '{}' });
    await load();
  }

  return (
    <section className={`desk-panel ${styles.list} ${styles.claims}`}>
      <div className="desk-panel-body desk-claims">
        <div className={styles.orderFilters}><button type="button" aria-pressed={!closedView} onClick={()=>{setClosedView(false);setPage(1)}}>Открытые · {openTotal}</button><button type="button" aria-pressed={closedView} onClick={()=>{setClosedView(true);setPage(1)}}>Закрытые</button>{canWrite&&<button type="button" aria-pressed={showForm} onClick={()=>setShowForm(!showForm)}>{showForm?'Скрыть форму':'Новая претензия'}</button>}</div>
        <div className="field"><input aria-label="Поиск претензий" placeholder="Заявка, клиент или телефон" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><p className="muted">Найдено: {total}</p>
        {canWrite && showForm ? (
          <form onSubmit={onCreate} className="panel desk-claims-form">
            <div className="desk-claims-form-head">
              <h2 className="desk-claims-form-title">Новая претензия</h2>
            </div>

            <div className="field desk-claims-order">
              <label>Заявка</label>
              {selectedOrder ? (
                <div className="desk-claims-picked">
                  <div className="desk-claims-picked-main">
                    <strong className="desk-claims-picked-id">
                      {selectedOrder.publicId}
                    </strong>
                    <span>{selectedOrder.client.name}</span>
                    <span className="muted">
                      {formatRuPhoneDisplay(
                        selectedOrder.client.phoneNormalized,
                      )}
                    </span>
                    <span className="muted">
                      Сумма заявки:{' '}
                      {formatMoney(selectedOrder.payment?.paid ?? 0)} ₽
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={clearOrder}
                  >
                    Сменить
                  </button>
                </div>
              ) : (
                <div className="order-suggest" ref={searchBoxRef}>
                  <input
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    onFocus={() => orderHits.length && setShowHits(true)}
                    placeholder="Номер заявки или телефон"
                    autoComplete="off"
                  />
                  {searching ? (
                    <p className="muted desk-claims-search-hint">Поиск…</p>
                  ) : null}
                  {showHits && orderHits.length > 0 ? (
                    <ul className="order-suggest-list">
                      {orderHits.map((o) => (
                        <li key={o.id}>
                          <button type="button" onClick={() => pickOrder(o)}>
                            <strong>{o.publicId}</strong>
                            {' · '}
                            {o.client.name}
                            <span className="muted">
                              {' · '}
                              {formatRuPhoneDisplay(o.client.phoneNormalized)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>

            <div className="desk-claims-form-row">
              <div className="field">
                <label>Тип</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {Object.entries(CLAIM_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Возврат, ₽</label>
                <input
                  inputMode="decimal"
                  value={form.refundSum}
                  onChange={(e) =>
                    setForm({ ...form, refundSum: e.target.value })
                  }
                />
              </div>

            </div>

            <button className="btn desk-claims-form-submit" type="submit">
              Создать
            </button>
          </form>
        ) : null}

        {loading&&<p className="muted">Загрузка...</p>}
        {error ? <p className="error desk-claims-error">{error}</p> : null}

        <div className={styles.mobileClaims}>{claims.map(c=><article className={styles.claimCard} key={c.id}><div className={styles.claimHeading}><Link href={`/orders/${c.order.id}`}><strong>№ {c.order.publicId}</strong></Link><span className={c.closedAt?'badge badge-muted':'badge badge-warn'}>{c.closedAt?'Закрыта':'Открыта'}</span></div><Link href={`/orders/${c.order.id}`} className={styles.claimClient}>{c.order.client.name}</Link><div className={styles.claimMeta}><span>{CLAIM_TYPES[c.type]??c.type}</span><time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Samara',day:'2-digit',month:'2-digit'})}</time></div><div className={styles.claimBottom}><span>Возврат <strong>{formatMoney(c.refundSum)} ₽</strong></span>{!c.closedAt&&canWrite&&<button type="button" className="btn secondary" onClick={()=>closeClaim(c.id).catch(e=>setError(e.message))}>Закрыть</button>}</div></article>)}{!claims.length&&!error&&!loading&&<p className={styles.orderEmpty}>{closedView?'Нет закрытых претензий':'Нет открытых претензий'}</p>}</div>
        <div className={`panel desk-claims-list ${styles.desktopClaims}`}>
          <div className="table-scroll">
            <table className="table desk-list">
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Тип</th>
                  <th className="desk-col-center">Дата</th>
                  <th className="desk-col-center">Возврат</th>
                  <th className="desk-col-center">Статус</th>
                  <th className="desk-col-center">Действие</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => {
                  const closed = Boolean(c.closedAt);
                  return (
                    <tr
                      key={c.id}
                      className={closed ? '' : 'row-claim-open'}
                    >
                      <td data-label="Заявка">
                        <div className="desk-cell">
                          <div className="desk-cell-top">
                            <Link
                              href={`/orders/${c.order.id}`}
                              className="desk-id desk-id-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.order.publicId}
                            </Link>
                          </div>
                          <div className="desk-cell-sub">
                            {c.order.client.name}

                          </div>
                        </div>
                      </td>
                      <td data-label="Тип">
                        <div className="desk-cell-main">
                          {CLAIM_TYPES[c.type] ?? c.type}
                        </div>
                      </td>
                      <td className="desk-col-center" data-label="Дата">
                        <span className="desk-cell-sub">
                          {new Date(c.createdAt).toLocaleDateString('ru-RU', {timeZone:'Europe/Samara',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="desk-col-center" data-label="Возврат">
                        <span className="desk-money">
                          {formatMoney(c.refundSum)} ₽
                        </span>
                      </td>
                      <td className="desk-col-center" data-label="Статус">
                        <span
                          className={
                            closed ? 'badge badge-muted' : 'badge badge-warn'
                          }
                        >
                          {closed ? 'Закрыта' : 'Открыта'}
                        </span>
                      </td>
                      <td className="desk-col-center" data-label="Действие">
                        {!closed && canWrite ? (
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => closeClaim(c.id).catch(e=>setError(e.message))}
                          >
                            Закрыть
                          </button>
                        ) : (
                          <span className="desk-cell-sub">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {claims.length === 0 && !error && !loading ? (
                  <tr>
                    <td colSpan={6} className="muted desk-col-center">
                      {closedView?'Нет закрытых претензий':'Нет открытых претензий'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        <nav className={styles.pagination} aria-label="Страницы претензий"><button className="btn secondary" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Назад</button><span>Страница {page} из {Math.max(1,totalPages)}</span><button className="btn secondary" disabled={loading||page>=totalPages} onClick={()=>setPage(p=>p+1)}>Далее</button></nav>
      </div>
    </section>
  );
}
