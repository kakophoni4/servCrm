'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { BranchSelect } from '@/components/BranchSelect';
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
  const [cities, setCities] = useState<City[]>([]);
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

  async function load() {
    if (!canRead) return;
    const [c, cityList] = await Promise.all([
      api<Claim[]>('/claims'),
      canWrite ? api<City[]>('/cities') : Promise.resolve([] as City[]),
    ]);
    setClaims(c);
    setCities(cityList);
    if (!form.cityId && cityList[0]) {
      setForm((f) => ({ ...f, cityId: f.cityId || cityList[0].id }));
    }
  }

  useEffect(() => {
    if (!canRead) return;
    load().catch((e) => {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (msg !== 'Недостаточно прав') setError(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

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
    <section className="desk-panel">
      <div className="desk-panel-body desk-claims">
        {canWrite ? (
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
              <BranchSelect
                cities={cities}
                value={form.cityId}
                onChange={(cityId) => setForm({ ...form, cityId })}
                allowEmpty
              />
            </div>

            <button className="btn desk-claims-form-submit" type="submit">
              Создать
            </button>
          </form>
        ) : null}

        {error ? <p className="error desk-claims-error">{error}</p> : null}

        <div className="panel desk-claims-list">
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
                      <td>
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
                            {c.city?.name ? ` · ${c.city.name}` : ''}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="desk-cell-main">
                          {CLAIM_TYPES[c.type] ?? c.type}
                        </div>
                      </td>
                      <td className="desk-col-center">
                        <span className="desk-cell-sub">
                          {new Date(c.createdAt).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="desk-col-center">
                        <span className="desk-money">
                          {formatMoney(c.refundSum)} ₽
                        </span>
                      </td>
                      <td className="desk-col-center">
                        <span
                          className={
                            closed ? 'badge badge-muted' : 'badge badge-warn'
                          }
                        >
                          {closed ? 'Закрыта' : 'Открыта'}
                        </span>
                      </td>
                      <td className="desk-col-center">
                        {!closed && canWrite ? (
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => closeClaim(c.id)}
                          >
                            Закрыть
                          </button>
                        ) : (
                          <span className="desk-cell-sub">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {claims.length === 0 && !error ? (
                  <tr>
                    <td colSpan={6} className="muted desk-col-center">
                      Претензий пока нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
