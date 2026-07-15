'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';

type Master = { id: string; user: { fullName: string } };

type Settlement = {
  id: string;
  masterId: string;
  amount: string | number;
  paidAmount?: string | number;
  periodFrom: string;
  periodTo: string;
  confirmedOnce: boolean;
  confirmedTwice: boolean;
  confirmedAt?: string | null;
  createdAt: string;
  master: { user: { fullName: string } };
  confirmedBy?: { fullName: string } | null;
};

const MONTH_LABELS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

function money(n: number) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function MasterSettlementsPanel() {
  const isOwner = (getStoredUser()?.role ?? '') === 'OWNER';
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i),
    [now],
  );

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [masterId, setMasterId] = useState('');
  const [calcAmount, setCalcAmount] = useState<number | null>(null);
  const [calcCount, setCalcCount] = useState(0);
  const [calcLoading, setCalcLoading] = useState(false);

  const [payId, setPayId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const { from, to } = monthBounds(year, month);

  const unpaidForForm = useMemo(() => {
    if (!masterId || !isOwner) return null;
    return (
      settlements.find((s) => {
        if (s.masterId !== masterId) return false;
        const due = Number(s.amount);
        const paid = Number(s.paidAmount ?? 0);
        if (due - paid <= 0) return false;
        return (
          s.periodFrom.slice(0, 10) === from && s.periodTo.slice(0, 10) === to
        );
      }) ?? null
    );
  }, [settlements, masterId, isOwner, from, to]);

  async function load() {
    const [list, m] = await Promise.all([
      api<Settlement[]>('/settlements'),
      api<Master[]>('/masters'),
    ]);
    setSettlements(list);
    setMasters(m);
    if (!masterId && m[0]) setMasterId(m[0].id);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!masterId) {
      setCalcAmount(null);
      setCalcCount(0);
      return;
    }
    setCalcLoading(true);
    api<{ amount: number; count: number }>(
      `/settlements/amount?masterId=${encodeURIComponent(masterId)}&from=${from}&to=${to}`,
    )
      .then((r) => {
        setCalcAmount(r.amount);
        setCalcCount(r.count);
      })
      .catch(() => {
        setCalcAmount(null);
        setCalcCount(0);
      })
      .finally(() => setCalcLoading(false));
  }, [masterId, from, to]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/settlements', {
        method: 'POST',
        body: JSON.stringify({
          masterId,
          periodFrom: from,
          periodTo: to,
        }),
      });
      setMsg('Расчёт создан');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function confirm(id: string, once: boolean) {
    setError('');
    setMsg('');
    try {
      await api(`/settlements/${id}/confirm`, { method: 'POST', body: '{}' });
      setMsg(
        !once
          ? 'Первое подтверждение выполнено'
          : 'Второе подтверждение выполнено — расчёт закрыт',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function openPay(s: Settlement) {
    const due = Number(s.amount);
    const paid = Number(s.paidAmount ?? 0);
    const remaining = Math.max(0, Math.round((due - paid) * 100) / 100);
    setPayId(s.id);
    setPayAmount(String(remaining));
  }

  async function submitPay(e: FormEvent) {
    e.preventDefault();
    if (!payId) return;
    setError('');
    setMsg('');
    try {
      await api(`/settlements/${payId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount) }),
      });
      setPayId(null);
      setMsg('Оплата внесена в кассу');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Мастер</label>
            <select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              required
            >
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Месяц</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Год</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Сумма сдачи, ₽</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                readOnly
                disabled
                style={{ flex: 1 }}
                value={
                  calcLoading
                    ? '…'
                    : calcAmount == null
                      ? '—'
                      : `${money(calcAmount)}${calcCount ? ` (${calcCount} заявок)` : ''}`
                }
              />
              {isOwner && unpaidForForm ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => openPay(unpaidForForm)}
                >
                  Внести оплату
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <button className="btn" type="submit" disabled={!calcAmount}>
          Создать расчёт
        </button>
      </form>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}

        {payId ? (
          <form
            onSubmit={submitPay}
            className="panel"
            style={{
              marginBottom: 16,
              background: '#f0fdfa',
              padding: '0.85rem 1rem',
            }}
          >
            <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>
              Внести оплату от мастера
            </p>
            <div className="grid-2">
              <div className="field">
                <label>Сумма, ₽</label>
                <input
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" type="submit">
                Принять в кассу
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setPayId(null)}
              >
                Отмена
              </button>
            </div>
          </form>
        ) : null}

        <table className="table">
          <thead>
            <tr>
              <th>Мастер</th>
              <th>Период</th>
              <th>К сдаче</th>
              <th>Оплачено</th>
              <th>Остаток</th>
              <th>Подтверждения</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => {
              const due = Number(s.amount);
              const paid = Number(s.paidAmount ?? 0);
              const remaining = Math.max(
                0,
                Math.round((due - paid) * 100) / 100,
              );
              return (
                <tr key={s.id}>
                  <td>{s.master.user.fullName}</td>
                  <td>
                    {new Date(s.periodFrom).toLocaleDateString('ru-RU')} —{' '}
                    {new Date(s.periodTo).toLocaleDateString('ru-RU')}
                  </td>
                  <td>{money(due)}</td>
                  <td>{money(paid)}</td>
                  <td>{money(remaining)}</td>
                  <td>
                    {s.confirmedOnce ? '✓1' : '○1'}{' '}
                    {s.confirmedTwice ? '✓2' : '○2'}
                    {s.confirmedBy ? (
                      <span className="muted"> · {s.confirmedBy.fullName}</span>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {isOwner && remaining > 0 ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => openPay(s)}
                        >
                          Внести оплату
                        </button>
                      ) : null}
                      {!s.confirmedOnce ? (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => confirm(s.id, false)}
                        >
                          Подтвердить (1)
                        </button>
                      ) : !s.confirmedTwice ? (
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => confirm(s.id, true)}
                        >
                          Подтвердить (2)
                        </button>
                      ) : (
                        <span className="muted">Закрыт</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  Расчётов пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
