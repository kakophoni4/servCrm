'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  CASH_DIRECTION_LABELS,
  CASH_EXPENSE_BASIS_LABELS,
  CASH_INCOME_BASIS_LABELS,
} from '@/lib/labels';

type CashTx = {
  id: string;
  direction: string;
  amount: string | number;
  incomeBasis?: string | null;
  expenseBasis?: string | null;
  description?: string | null;
  createdAt: string;
  order?: { publicId: string } | null;
  createdBy?: { fullName: string } | null;
};

type OrderOpt = { id: string; publicId: string };

export default function CashPage() {
  const [txs, setTxs] = useState<CashTx[]>([]);
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'income' | 'expense' | 'collection'>('income');

  const [income, setIncome] = useState({
    amount: '',
    incomeBasis: 'ORDER',
    orderId: '',
    description: '',
  });
  const [expense, setExpense] = useState({
    amount: '',
    expenseBasis: 'OPERATING',
    description: '',
  });
  const [collection, setCollection] = useState({ amount: '', description: '' });

  async function load() {
    const [list, orderList] = await Promise.all([
      api<CashTx[]>('/cash'),
      api<OrderOpt[]>('/orders'),
    ]);
    setTxs(list);
    setOrders(orderList);
    if (!income.orderId && orderList[0]) {
      setIncome((f) => ({ ...f, orderId: orderList[0].id }));
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitIncome(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/cash/income', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(income.amount),
          incomeBasis: income.incomeBasis,
          orderId: income.incomeBasis === 'ORDER' ? income.orderId || undefined : undefined,
          description: income.description || undefined,
        }),
      });
      setIncome((f) => ({ ...f, amount: '', description: '' }));
      setMsg('Приход записан');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function submitExpense(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/cash/expense', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(expense.amount),
          expenseBasis: expense.expenseBasis,
          description: expense.description || undefined,
        }),
      });
      setExpense((f) => ({ ...f, amount: '', description: '' }));
      setMsg('Расход записан');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function submitCollection(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/cash/collection', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(collection.amount),
          description: collection.description || undefined,
        }),
      });
      setCollection({ amount: '', description: '' });
      setMsg('Инкассация записана');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Касса</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['income', 'expense', 'collection'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'btn' : 'btn secondary'}
            onClick={() => setTab(t)}
          >
            {t === 'income' ? 'Приход' : t === 'expense' ? 'Расход' : 'Инкассация'}
          </button>
        ))}
      </div>

      {tab === 'income' ? (
        <form className="panel" onSubmit={submitIncome} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                value={income.amount}
                onChange={(e) => setIncome({ ...income, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Основание</label>
              <select
                value={income.incomeBasis}
                onChange={(e) => setIncome({ ...income, incomeBasis: e.target.value })}
              >
                {Object.entries(CASH_INCOME_BASIS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            {income.incomeBasis === 'ORDER' ? (
              <div className="field">
                <label>Заявка</label>
                <select
                  value={income.orderId}
                  onChange={(e) => setIncome({ ...income, orderId: e.target.value })}
                >
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.publicId}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label>Комментарий</label>
              <input
                value={income.description}
                onChange={(e) => setIncome({ ...income, description: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Записать приход
          </button>
        </form>
      ) : null}

      {tab === 'expense' ? (
        <form className="panel" onSubmit={submitExpense} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Статья расхода</label>
              <select
                value={expense.expenseBasis}
                onChange={(e) => setExpense({ ...expense, expenseBasis: e.target.value })}
              >
                {Object.entries(CASH_EXPENSE_BASIS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Комментарий</label>
              <input
                value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Записать расход
          </button>
        </form>
      ) : null}

      {tab === 'collection' ? (
        <form className="panel" onSubmit={submitCollection} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                value={collection.amount}
                onChange={(e) => setCollection({ ...collection, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Комментарий</label>
              <input
                value={collection.description}
                onChange={(e) => setCollection({ ...collection, description: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Записать инкассацию
          </button>
        </form>
      ) : null}

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Сумма</th>
              <th>Основание</th>
              <th>Заявка</th>
              <th>Кто</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                <td>{CASH_DIRECTION_LABELS[t.direction] ?? t.direction}</td>
                <td>{String(t.amount)}</td>
                <td>
                  {t.incomeBasis
                    ? (CASH_INCOME_BASIS_LABELS[t.incomeBasis] ?? t.incomeBasis)
                    : t.expenseBasis
                      ? (CASH_EXPENSE_BASIS_LABELS[t.expenseBasis] ?? t.expenseBasis)
                      : '—'}
                </td>
                <td>{t.order?.publicId ?? '—'}</td>
                <td>{t.createdBy?.fullName ?? '—'}</td>
                <td>{t.description ?? '—'}</td>
              </tr>
            ))}
            {txs.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Операций пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
