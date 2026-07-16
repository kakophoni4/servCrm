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
  fines: number;
  salary: number;
  salaryNet: number;
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

function ordersLabel(n: number) {
  if (n === 1) return '1 заявка';
  if (n > 1 && n < 5) return `${n} заявки`;
  return `${n} заявок`;
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

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.due += r.due;
        acc.fines += r.fines ?? 0;
        acc.salaryNet += r.salaryNet ?? 0;
        acc.paid += r.paid;
        acc.remaining += r.remaining;
        return acc;
      },
      { due: 0, fines: 0, salaryNet: 0, paid: 0, remaining: 0 },
    );
  }, [rows]);

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
    <div className="settle-board">
      <div className="panel settle-filters">
        <div className="period-filters">
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
        </div>
      </div>

      <div className="panel settle-panel">
        {error && !payRow ? <p className="error">{error}</p> : null}
        {msg ? <p className="ok-msg">{msg}</p> : null}
        {loading ? <p className="muted">Загрузка…</p> : null}

        {!loading && rows.length > 0 ? (
          <div className="settle-summary">
            <div className="settle-summary-item">
              <span>К сдаче</span>
              <strong>{money(totals.due)} ₽</strong>
            </div>
            <div className="settle-summary-item">
              <span>Штрафы</span>
              <strong>{money(totals.fines)} ₽</strong>
            </div>
            <div className="settle-summary-item">
              <span>ЗП нетто</span>
              <strong>{money(totals.salaryNet)} ₽</strong>
            </div>
            <div className="settle-summary-item">
              <span>Сдано</span>
              <strong>{money(totals.paid)} ₽</strong>
            </div>
            <div className="settle-summary-item accent">
              <span>Остаток</span>
              <strong>{money(totals.remaining)} ₽</strong>
            </div>
          </div>
        ) : null}

        {!loading ? (
          <div className="table-scroll">
            <table className="table settle-table">
              <thead>
                <tr>
                  <th>Мастер</th>
                  <th className="num">К сдаче</th>
                  <th className="num">Штрафы</th>
                  <th className="num">ЗП (нетто)</th>
                  <th className="num">Сдано</th>
                  <th className="num">Остаток</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const done = row.remaining <= 0 && row.due > 0;
                  return (
                    <tr
                      key={row.masterId}
                      className={
                        done
                          ? 'settle-row done'
                          : row.remaining > 0
                            ? 'settle-row due'
                            : 'settle-row'
                      }
                    >
                      <td>
                        <div className="settle-master">
                          <span className="settle-master-name">{row.name}</span>
                          {row.orderCount > 0 ? (
                            <span className="settle-master-meta">
                              {ordersLabel(row.orderCount)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="num">{money(row.due)}</td>
                      <td className="num">
                        <span
                          className={
                            (row.fines ?? 0) > 0 ? 'settle-fines' : undefined
                          }
                        >
                          {money(row.fines ?? 0)}
                        </span>
                      </td>
                      <td className="num">
                        <div className="settle-salary">
                          <span>{money(row.salaryNet ?? 0)}</span>
                          {(row.fines ?? 0) > 0 ? (
                            <span className="settle-master-meta">
                              из {money(row.salary ?? 0)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="num">{money(row.paid)}</td>
                      <td className="num">
                        <span
                          className={
                            row.remaining > 0
                              ? 'settle-remain'
                              : 'settle-remain zero'
                          }
                        >
                          {money(row.remaining)}
                        </span>
                      </td>
                      <td className="settle-actions">
                        {canPay && row.remaining > 0 ? (
                          <button
                            type="button"
                            className="btn settle-pay-btn"
                            onClick={() => openPay(row)}
                          >
                            Принять оплату
                          </button>
                        ) : done ? (
                          <span className="settle-badge">Сдано</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Нет закрытых заявок и штрафов мастеров за этот месяц.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {payRow ? (
        <div
          className="notify-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-modal-title"
        >
          <div className="notify-card settle-pay-modal">
            <h2 id="pay-modal-title" className="notify-title">
              Принять оплату
            </h2>
            <p className="settle-pay-meta">
              {payRow.name}
              <span>· остаток {money(payRow.remaining)} ₽</span>
            </p>

            {error ? <p className="error">{error}</p> : null}

            {payStep === 1 ? (
              <form onSubmit={onPayNext} className="settle-pay-form">
                <div className="field">
                  <label>Сумма, ₽</label>
                  <input
                    required
                    inputMode="decimal"
                    autoFocus
                    placeholder="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div className="settle-pay-actions">
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
              <form onSubmit={onPayConfirm} className="settle-pay-form">
                <p className="settle-pay-confirm">
                  Подтвердите: принять{' '}
                  <strong>{money(Number(payAmount) || 0)} ₽</strong> от{' '}
                  <strong>{payRow.name}</strong>?
                </p>
                <div className="settle-pay-actions">
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
