'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, appendFormFields, uploadFiles } from '@/lib/api';
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
  documentPath?: string | null;
  createdAt: string;
  city?: { id: string; name: string } | null;
  order?: { publicId: string } | null;
  createdBy?: { fullName: string } | null;
};

type OrderOpt = { id: string; publicId: string };
type City = { id: string; name: string };

export default function CashPage() {
  const [txs, setTxs] = useState<CashTx[]>([]);
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'income' | 'expense' | 'collection'>('income');

  const [income, setIncome] = useState({
    amount: '',
    incomeBasis: 'ORDER',
    orderId: '',
    cityId: '',
    description: '',
  });
  const [incomeFile, setIncomeFile] = useState<File | null>(null);

  const [expense, setExpense] = useState({
    amount: '',
    expenseBasis: 'OPERATING',
    cityId: '',
    description: '',
  });
  const [expenseFile, setExpenseFile] = useState<File | null>(null);

  const [collection, setCollection] = useState({
    amount: '',
    cityId: '',
    description: '',
  });
  const [collectionFile, setCollectionFile] = useState<File | null>(null);

  async function load() {
    const [list, orderList, cityList] = await Promise.all([
      api<CashTx[]>('/cash'),
      api<OrderOpt[]>('/orders'),
      api<City[]>('/cities'),
    ]);
    setTxs(list);
    setOrders(orderList);
    setCities(cityList);
    const defaultCity = cityList[0]?.id ?? '';
    if (!income.orderId && orderList[0]) {
      setIncome((f) => ({ ...f, orderId: orderList[0].id }));
    }
    if (defaultCity) {
      setIncome((f) => (f.cityId ? f : { ...f, cityId: defaultCity }));
      setExpense((f) => (f.cityId ? f : { ...f, cityId: defaultCity }));
      setCollection((f) => (f.cityId ? f : { ...f, cityId: defaultCity }));
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function citySelect(
    value: string,
    onChange: (cityId: string) => void,
    required = false,
  ) {
    return (
      <div className="field">
        <label>Город</label>
        <select
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function fileField(
    file: File | null,
    setFile: (f: File | null) => void,
    required: boolean,
  ) {
    return (
      <div className="field">
        <label>Документ{required ? ' *' : ''}</label>
        <input
          type="file"
          required={required}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? <span className="muted">{file.name}</span> : null}
      </div>
    );
  }

  async function submitIncome(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const fd = appendFormFields(new FormData(), {
        amount: income.amount,
        incomeBasis: income.incomeBasis,
        orderId:
          income.incomeBasis === 'ORDER' ? income.orderId || undefined : undefined,
        cityId: income.cityId || undefined,
        description: income.description || undefined,
      });
      if (incomeFile) fd.append('file', incomeFile);
      await uploadFiles('/cash/income', fd);
      setIncome((f) => ({ ...f, amount: '', description: '' }));
      setIncomeFile(null);
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
    if (!expenseFile) {
      setError('Для расхода нужен документ');
      return;
    }
    try {
      const fd = appendFormFields(new FormData(), {
        amount: expense.amount,
        expenseBasis: expense.expenseBasis,
        cityId: expense.cityId || undefined,
        description: expense.description || undefined,
      });
      fd.append('file', expenseFile);
      await uploadFiles('/cash/expense', fd);
      setExpense((f) => ({ ...f, amount: '', description: '' }));
      setExpenseFile(null);
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
      const fd = appendFormFields(new FormData(), {
        amount: collection.amount,
        cityId: collection.cityId || undefined,
        description: collection.description || undefined,
      });
      if (collectionFile) fd.append('file', collectionFile);
      await uploadFiles('/cash/collection', fd);
      setCollection((f) => ({ ...f, amount: '', description: '' }));
      setCollectionFile(null);
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
            {citySelect(income.cityId, (cityId) => setIncome({ ...income, cityId }))}
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
            {fileField(incomeFile, setIncomeFile, false)}
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
            {citySelect(expense.cityId, (cityId) => setExpense({ ...expense, cityId }))}
            {fileField(expenseFile, setExpenseFile, true)}
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
                onChange={(e) =>
                  setCollection({ ...collection, amount: e.target.value })
                }
              />
            </div>
            {citySelect(collection.cityId, (cityId) =>
              setCollection({ ...collection, cityId }),
            )}
            {fileField(collectionFile, setCollectionFile, false)}
            <div className="field">
              <label>Комментарий</label>
              <input
                value={collection.description}
                onChange={(e) =>
                  setCollection({ ...collection, description: e.target.value })
                }
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
              <th>Город</th>
              <th>Основание</th>
              <th>Заявка</th>
              <th>Документ</th>
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
                <td>{t.city?.name ?? '—'}</td>
                <td>
                  {t.incomeBasis
                    ? (CASH_INCOME_BASIS_LABELS[t.incomeBasis] ?? t.incomeBasis)
                    : t.expenseBasis
                      ? (CASH_EXPENSE_BASIS_LABELS[t.expenseBasis] ?? t.expenseBasis)
                      : '—'}
                </td>
                <td>{t.order?.publicId ?? '—'}</td>
                <td>{t.documentPath ? 'есть' : '—'}</td>
                <td>{t.createdBy?.fullName ?? '—'}</td>
                <td>{t.description ?? '—'}</td>
              </tr>
            ))}
            {txs.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
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
