'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';

type BoardRow = {
  masterId: string;
  name: string;
  due: number;
  paid: number;
  remaining: number;
  orderCount: number;
  settlementId: string | null;
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
  const user = getStoredUser();
  const canPay =
    (user?.role ?? '') === 'OWNER' &&
    hasPermission(user?.role ?? '', user?.permissions, 'settlements.pay');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [rows, setRows] = useState<BoardRow[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [payRow, setPayRow] = useState<BoardRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payStep, setPayStep] = useState<1 | 2>(1);
  const [paying, setPaying] = useState(false);

  const { from, to } = monthBounds(year, month);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await api<BoardRow[]>(
        `/settlements/board?from=${from}&to=${to}`,
      );
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  function openPay(row: BoardRow) {
    setError('');
    setMsg('');
    setPayRow(row);
    setPayAmount(String(row.remaining));
    setPayStep(1);
  }

  function closePay() {
    if (paying) return;
    setPayRow(null);
    setPayAmount('');
    setPayStep(1);
  }

  function onPayNext(e: FormEvent) {
    e.preventDefault();
    setError('');
    const amount = Number(payAmount);
    if (!(amount > 0)) {
      setError('Укажите сумму больше 0');
      return;
    }
    if (payRow && amount > payRow.remaining + 0.001) {
      setError(`Нельзя больше остатка (${money(payRow.remaining)} ₽)`);
      return;
    }
    setPayStep(2);
  }

  async function onPayConfirm(e: FormEvent) {
    e.preventDefault();
    if (!payRow) return;
    setError('');
    setMsg('');
    setPaying(true);
    try {
      await api('/settlements/accept-payment', {
        method: 'POST',
        body: JSON.stringify({
          masterId: payRow.masterId,
          periodFrom: from,
          periodTo: to,
          amount: Number(payAmount),
        }),
      });
      setPayRow(null);
      setPayStep(1);
      setMsg('Оплата принята');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setPayStep(1);
    } finally {
      setPaying(false);
    }
  }

  return (
    <div>
      <div
        className="panel"
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div className="field" style={{ margin: 0, minWidth: 140 }}>
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
        <div className="field" style={{ margin: 0, minWidth: 100 }}>
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
      </div>

      <div className="panel">
        {error && !payRow ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}
        {loading ? <p className="muted">Загрузка…</p> : null}

        {!loading ? (
          <table className="table">
            <thead>
              <tr>
                <th>Мастер</th>
                <th>К сдаче</th>
                <th>Оплачено</th>
                <th>Остаток</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.masterId}>
                  <td>
                    {row.name}
                    {row.orderCount > 0 ? (
                      <div className="muted">
                        {row.orderCount}{' '}
                        {row.orderCount === 1
                          ? 'заявка'
                          : row.orderCount < 5
                            ? 'заявки'
                            : 'заявок'}
                      </div>
                    ) : null}
                  </td>
                  <td>{money(row.due)}</td>
                  <td>{money(row.paid)}</td>
                  <td>{money(row.remaining)}</td>
                  <td>
                    {canPay && row.remaining > 0 ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => openPay(row)}
                      >
                        Принять оплату
                      </button>
                    ) : row.remaining <= 0 && row.due > 0 ? (
                      <span className="muted">Сдано</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Нет закрытых заявок мастеров за этот месяц.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
      </div>

      {payRow ? (
        <div
          className="notify-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-modal-title"
        >
          <div className="notify-card">
            <h2 id="pay-modal-title" className="notify-title">
              Принять оплату
            </h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {payRow.name} · остаток {money(payRow.remaining)} ₽
            </p>

            {error ? <p className="error">{error}</p> : null}

            {payStep === 1 ? (
              <form onSubmit={onPayNext}>
                <div className="field">
                  <label>Сумма, ₽</label>
                  <input
                    required
                    inputMode="decimal"
                    autoFocus
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn" type="submit">
                    Далее
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={closePay}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={onPayConfirm}>
                <p style={{ margin: '0 0 1rem' }}>
                  Подтвердите ещё раз: принять{' '}
                  <strong>{money(Number(payAmount) || 0)} ₽</strong> от{' '}
                  <strong>{payRow.name}</strong>?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" type="submit" disabled={paying}>
                    {paying ? 'Сохранение…' : 'Подтверждаю'}
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={paying}
                    onClick={() => setPayStep(1)}
                  >
                    Назад
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={paying}
                    onClick={closePay}
                  >
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
