'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

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

type OrderOpt = { id: string; publicId: string };

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    orderId: '',
    type: 'PRICE_DISSATISFIED',
    refundSum: '0',
    orderSum: '0',
  });

  async function load() {
    const [c, o] = await Promise.all([
      api<Claim[]>('/claims'),
      api<OrderOpt[]>('/orders'),
    ]);
    setClaims(c);
    setOrders(o);
    if (!form.orderId && o[0]) setForm((f) => ({ ...f, orderId: o[0].id }));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/claims', {
        method: 'POST',
        body: JSON.stringify({
          orderId: form.orderId,
          type: form.type,
          refundSum: Number(form.refundSum),
          orderSum: Number(form.orderSum),
        }),
      });
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
    <div>
      <h1 className="page-title">Претензии</h1>
      <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Заявка</label>
            <select
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.publicId}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Тип претензии</label>
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
            <label>Сумма возврата</label>
            <input
              value={form.refundSum}
              onChange={(e) => setForm({ ...form, refundSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Сумма заявки</label>
            <input
              value={form.orderSum}
              onChange={(e) => setForm({ ...form, orderSum: e.target.value })}
            />
          </div>
        </div>
        <button className="btn" type="submit">
          Создать претензию
        </button>
      </form>
      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Заявка</th>
              <th>Клиент</th>
              <th>Тип</th>
              <th>Создана</th>
              <th>Закрыта</th>
              <th>Возврат</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/orders/${c.order.id}`}>{c.order.publicId}</Link>
                </td>
                <td>{c.order.client.name}</td>
                <td>{CLAIM_TYPES[c.type] ?? c.type}</td>
                <td>{new Date(c.createdAt).toLocaleString('ru-RU')}</td>
                <td>
                  {c.closedAt
                    ? new Date(c.closedAt).toLocaleString('ru-RU')
                    : '—'}
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
