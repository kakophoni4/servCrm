'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { BranchSelect } from '@/components/BranchSelect';
import { api, getStoredUser } from '@/lib/api';
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
    refundSum: '0',
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
        refundSum: '0',
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
      <div className="desk-panel-body">
        {canWrite ? (
        <form onSubmit={onCreate} className="desk-claims-form">
          <div className="field">
            <label>Заявка</label>
            {selectedOrder ? (
              <div className="order-suggest-selected">
                <span>
                  <strong>{selectedOrder.publicId}</strong>
                  {' · '}
                  {selectedOrder.client.name}
                </span>
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
                  placeholder="номер заявки/телефон клиента"
                  autoComplete="off"
                />
                {searching ? (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
                    Поиск…
                  </p>
                ) : null}
                {showHits && orderHits.length > 0 ? (
                  <ul className="order-suggest-list">
                    {orderHits.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => pickOrder(o)}>
                          <strong>{o.publicId}</strong>
                          {' · '}
                          {o.client.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>
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
              value={form.refundSum}
              onChange={(e) => setForm({ ...form, refundSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Сумма заявки</label>
            <input
              readOnly
              disabled
              value={
                selectedOrder ? String(selectedOrder.payment?.paid ?? 0) : '—'
              }
            />
          </div>
          <BranchSelect
            cities={cities}
            value={form.cityId}
            onChange={(cityId) => setForm({ ...form, cityId })}
            allowEmpty
          />
          <button className="btn" type="submit">
            Создать
          </button>
        </form>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <table className="table">
          <thead>
            <tr>
              <th>Заявка</th>
              <th>Тип</th>
              <th>Возврат</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/orders/${c.order.id}`}>{c.order.publicId}</Link>
                  <div className="muted">{c.order.client.name}</div>
                </td>
                <td>
                  {CLAIM_TYPES[c.type] ?? c.type}
                  <div className="muted">
                    {c.closedAt ? 'Закрыта' : 'Открыта'}
                  </div>
                </td>
                <td>{String(c.refundSum)}</td>
                <td>
                  {!c.closedAt ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => closeClaim(c.id)}
                    >
                      Закрыть
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {claims.length === 0 && !error ? (
              <tr>
                <td colSpan={4} className="muted">
                  Претензий пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
