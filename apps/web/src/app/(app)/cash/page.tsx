'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BranchSelect } from '@/components/BranchSelect';
import { OpsShell } from '@/components/ops/OpsShell';
import { api, appendFormFields, getStoredUser, uploadFiles } from '@/lib/api';
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

type City = { id: string; name: string };

/** Ручной приход — без «По заявке» (тот только автоматически при «Готов»). */
const MANUAL_INCOME_BASIS = Object.fromEntries(
  Object.entries(CASH_INCOME_BASIS_LABELS).filter(([k]) => k !== 'ORDER'),
);

const EXPENSE_GROUPS: { title: string; keys: string[] }[] = [
  {
    title: 'Зарплата',
    keys: [
      'SALARY_DIR',
      'SALARY_DISP',
      'SALARY_SENIOR_MASTER',
      'SALARY_PROMO',
      'BONUS',
    ],
  },
  {
    title: 'Аренда',
    keys: ['RENT_APT', 'RENT_OFFICE'],
  },
  {
    title: 'Реклама',
    keys: ['LEAFLETS', 'HIRE_ADS', 'AVITO_ADS', 'CONTEST'],
  },
  {
    title: 'Прочее',
    keys: [
      'OPERATING',
      'OFFICE',
      'CARDS',
      'TRIP',
      'COLLECTION_FEE',
      'SELF_EMPLOYED_TAX',
      'IP_EXPENSE',
      'OTHER_EXPENSE',
    ],
  },
];

export default function CashPage() {
  const isOwner = (getStoredUser()?.role ?? '') === 'OWNER';
  const [txs, setTxs] = useState<CashTx[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'income' | 'expense' | 'collection'>('income');

  const defaultIncomeBasis = useMemo(
    () => Object.keys(MANUAL_INCOME_BASIS)[0] ?? 'OTHER',
    [],
  );

  const [income, setIncome] = useState({
    amount: '',
    incomeBasis: 'EXTRA_FUNDING',
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

  async function load() {
    const [list, cityList] = await Promise.all([
      api<CashTx[]>('/cash'),
      api<City[]>('/cities'),
    ]);
    setTxs(list);
    setCities(cityList);
    const defaultCity = cityList[0]?.id ?? '';
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

  useEffect(() => {
    if (!isOwner && tab === 'collection') setTab('income');
  }, [isOwner, tab]);

  function fileField(
    file: File | null,
    setFile: (f: File | null) => void,
    required: boolean,
  ) {
    return (
      <div className="field">
        <label>Документ{required ? ' *' : ''}</label>
        <label className="file-picker">
          <input
            type="file"
            required={required}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="file-picker-title">
            {file?.name ?? 'Выбрать файл'}
          </span>
          <span className="file-picker-hint">фото или PDF</span>
        </label>
      </div>
    );
  }

  async function submitIncome(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (income.incomeBasis === 'ORDER') {
      setError('Приход по заявке создаётся автоматически при статусе «Готов»');
      return;
    }
    try {
      const fd = appendFormFields(new FormData(), {
        amount: income.amount,
        incomeBasis: income.incomeBasis || defaultIncomeBasis,
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
    if (!collection.cityId) {
      setError('Укажите филиал');
      return;
    }
    try {
      await api('/cash/collection', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(collection.amount),
          cityId: collection.cityId,
          description: collection.description || undefined,
        }),
      });
      setCollection((f) => ({ amount: '', cityId: f.cityId, description: '' }));
      setMsg('Инкассация записана');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <OpsShell>
    <div>
      <div className="cash-tabs">
        {(
          [
            'income',
            'expense',
            ...(isOwner ? (['collection'] as const) : []),
          ] as const
        ).map((t) => (
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
        <form className="panel cash-form" onSubmit={submitIncome}>
          <div className="cash-form-row">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                inputMode="decimal"
                value={income.amount}
                onChange={(e) => setIncome({ ...income, amount: e.target.value })}
              />
            </div>
            <BranchSelect
              cities={cities}
              value={income.cityId}
              onChange={(cityId) => setIncome({ ...income, cityId })}
            />
            {fileField(incomeFile, setIncomeFile, false)}
          </div>

          <div className="field">
            <label>Основание</label>
            <div className="cash-chip-grid">
              {Object.entries(MANUAL_INCOME_BASIS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={
                    income.incomeBasis === k
                      ? 'cash-chip cash-chip-active'
                      : 'cash-chip'
                  }
                  onClick={() => setIncome({ ...income, incomeBasis: k })}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Комментарий</label>
            <input
              value={income.description}
              onChange={(e) =>
                setIncome({ ...income, description: e.target.value })
              }
            />
          </div>

          <button className="btn" type="submit">
            Записать приход
          </button>
        </form>
      ) : null}

      {tab === 'expense' ? (
        <form className="panel cash-form" onSubmit={submitExpense}>
          <div className="cash-form-row">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                inputMode="decimal"
                value={expense.amount}
                onChange={(e) =>
                  setExpense({ ...expense, amount: e.target.value })
                }
              />
            </div>
            <BranchSelect
              cities={cities}
              value={expense.cityId}
              onChange={(cityId) => setExpense({ ...expense, cityId })}
            />
            {fileField(expenseFile, setExpenseFile, true)}
          </div>

          <div className="field">
            <label>Статья расхода</label>
            <p className="muted cash-selected">
              Выбрано:{' '}
              <strong>
                {CASH_EXPENSE_BASIS_LABELS[expense.expenseBasis] ??
                  expense.expenseBasis}
              </strong>
            </p>
            <div className="cash-expense-groups">
              {EXPENSE_GROUPS.map((group) => (
                <div key={group.title} className="cash-expense-group">
                  <div className="cash-expense-group-title">{group.title}</div>
                  <div className="cash-chip-grid">
                    {group.keys.map((k) => {
                      const label = CASH_EXPENSE_BASIS_LABELS[k];
                      if (!label) return null;
                      return (
                        <button
                          key={k}
                          type="button"
                          className={
                            expense.expenseBasis === k
                              ? 'cash-chip cash-chip-active'
                              : 'cash-chip'
                          }
                          onClick={() =>
                            setExpense({ ...expense, expenseBasis: k })
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Комментарий</label>
            <input
              value={expense.description}
              onChange={(e) =>
                setExpense({ ...expense, description: e.target.value })
              }
            />
          </div>

          <button className="btn" type="submit">
            Записать расход
          </button>
        </form>
      ) : null}

      {tab === 'collection' && isOwner ? (
        <form className="panel cash-form" onSubmit={submitCollection}>
          <div className="cash-form-row">
            <div className="field">
              <label>Сумма, ₽</label>
              <input
                required
                inputMode="decimal"
                value={collection.amount}
                onChange={(e) =>
                  setCollection({ ...collection, amount: e.target.value })
                }
              />
            </div>
            <BranchSelect
              cities={cities}
              value={collection.cityId}
              onChange={(cityId) => setCollection({ ...collection, cityId })}
              required
            />
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
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Филиал</th>
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
                      ? (CASH_INCOME_BASIS_LABELS[t.incomeBasis] ??
                        t.incomeBasis)
                      : t.expenseBasis
                        ? (CASH_EXPENSE_BASIS_LABELS[t.expenseBasis] ??
                          t.expenseBasis)
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
    </div>
    </OpsShell>
  );
}
