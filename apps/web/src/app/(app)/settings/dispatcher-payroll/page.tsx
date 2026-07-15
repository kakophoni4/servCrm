'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  DispatcherPayCalc,
  getDispatcherPaySummary,
} from '@/lib/api';
import { currentMonthRange } from '@/lib/labels';

function money(n: number) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function DispatcherPayrollPage() {
  const defaultRange = currentMonthRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [rows, setRows] = useState<DispatcherPayCalc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(periodFrom = from, periodTo = to) {
    setLoading(true);
    setError('');
    try {
      setRows(await getDispatcherPaySummary(periodFrom, periodTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    load();
  }

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div>
      <h1 className="page-title">Расчёт диспетчеров</h1>

      <form className="panel" onSubmit={onFilter}>
        <div className="grid-2">
          <div className="field">
            <label>С</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label>По</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Считаем…' : 'Пересчитать'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <div className="panel" style={{ marginTop: 16 }}>
        {loading && !rows.length ? (
          <p className="muted">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Нет диспетчеров или данных за период.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Диспетчер</th>
                <th>Оклад</th>
                <th>% оборота</th>
                <th>Бонус листовки</th>
                <th>Бонус заявки</th>
                <th>ИТОГО</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>{r.fullName}</td>
                  <td>{money(r.salaryBase)}</td>
                  <td>{money(r.dailyTurnoverPay)}</td>
                  <td>{money(r.leafletsPay)}</td>
                  <td>{money(r.closedOrdersBonus)}</td>
                  <td>
                    <strong>{money(r.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>ИТОГО по диспетчерам</h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              height: 180,
              paddingTop: 8,
            }}
          >
            {rows.map((r) => {
              const h = Math.max(4, Math.round((r.total / maxTotal) * 140));
              return (
                <div
                  key={r.userId}
                  style={{
                    flex: 1,
                    minWidth: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title={`${r.fullName}: ${money(r.total)} ₽`}
                >
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {money(r.total)}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 56,
                      height: h,
                      background: '#0f766e',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      textAlign: 'center',
                      lineHeight: 1.2,
                      maxWidth: 72,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r.fullName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
