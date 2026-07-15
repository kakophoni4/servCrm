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
  cityId?: string | null;
  order: { id: string; publicId: string; client: { name: string } };
  city?: { id?: string; name: string } | null;
};

type OrderOpt = { id: string; publicId: string };
type City = { id: string; name: string };

type EditState = {
  type: string;
  refundSum: string;
  orderSum: string;
};

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({
    type: 'PRICE_DISSATISFIED',
    refundSum: '0',
    orderSum: '0',
  });
  const [form, setForm] = useState({
    orderId: '',
    type: 'PRICE_DISSATISFIED',
    refundSum: '0',
    orderSum: '0',
    cityId: '',
  });

  async function load() {
    const [c, o, cityList] = await Promise.all([
      api<Claim[]>('/claims'),
      api<OrderOpt[]>('/orders'),
      api<City[]>('/cities'),
    ]);
    setClaims(c);
    setOrders(o);
    setCities(cityList);
    if (!form.orderId && o[0]) setForm((f) => ({ ...f, orderId: o[0].id }));
    if (!form.cityId && cityList[0]) {
      setForm((f) => ({ ...f, cityId: f.cityId || cityList[0].id }));
    }
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
          cityId: form.cityId || undefined,
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

  function startEdit(c: Claim) {
    setEditingId(c.id);
    setEdit({
      type: c.type,
      refundSum: String(c.refundSum),
      orderSum: String(c.orderSum),
    });
  }

  async function saveEdit(id: string) {
    setError('');
    try {
      await api(`/claims/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: edit.type,
          refundSum: Number(edit.refundSum),
          orderSum: Number(edit.orderSum),
        }),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
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
          <div className="field">
            <label>Город</label>
            <select
              value={form.cityId}
              onChange={(e) => setForm({ ...form, cityId: e.target.value })}
            >
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
              <th>Город</th>
              <th>Тип</th>
              <th>Создана</th>
              <th>Закрыта</th>
              <th>Возврат</th>
              <th>Сумма заявки</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => {
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/orders/${c.order.id}`}>{c.order.publicId}</Link>
                  </td>
                  <td>{c.order.client.name}</td>
                  <td>{c.city?.name ?? '—'}</td>
                  <td>
                    {isEditing ? (
                      <select
                        value={edit.type}
                        onChange={(e) => setEdit({ ...edit, type: e.target.value })}
                      >
                        {Object.entries(CLAIM_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      CLAIM_TYPES[c.type] ?? c.type
                    )}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleString('ru-RU')}</td>
                  <td>
                    {c.closedAt
                      ? new Date(c.closedAt).toLocaleString('ru-RU')
                      : '—'}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        value={edit.refundSum}
                        onChange={(e) =>
                          setEdit({ ...edit, refundSum: e.target.value })
                        }
                        style={{ width: 90 }}
                      />
                    ) : (
                      String(c.refundSum)
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        value={edit.orderSum}
                        onChange={(e) =>
                          setEdit({ ...edit, orderSum: e.target.value })
                        }
                        style={{ width: 90 }}
                      />
                    ) : (
                      String(c.orderSum)
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => saveEdit(c.id)}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Отмена
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => startEdit(c)}
                        >
                          Изменить
                        </button>
                      )}
                      {!c.closedAt ? (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => closeClaim(c.id)}
                        >
                          Закрыть
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
