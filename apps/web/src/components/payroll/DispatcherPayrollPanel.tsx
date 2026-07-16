'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DispatcherPayCalc,
  getDispatcherPaySummary,
} from '@/lib/api';

function money(n: number) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

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

export function DispatcherPayrollPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i),
    [now],
  );

  const [rows, setRows] = useState<DispatcherPayCalc[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(y = year, m = month) {
    const { from, to } = monthBounds(y, m);
    setLoading(true);
    setError('');
    try {
      setRows(await getDispatcherPaySummary(from, to));
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
  }, [year, month]);

  return (
    <div className="settle-board">
      <div className="panel settle-panel">
        <div className="panel-period-head">
          <h2 className="panel-period-title">Расчёт диспетчеров</h2>
          <div className="period-filters">
            <div className="field">
              <select
                aria-label="Месяц"
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
              <select
                aria-label="Год"
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

        {error ? <p className="error">{error}</p> : null}

        {loading && !rows.length ? (
          <p className="muted">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Нет диспетчеров или данных за период.</p>
        ) : (
          <div className="table-scroll">
            <table className="table settle-table">
              <thead>
                <tr>
                  <th>Диспетчер</th>
                  <th className="num">Мес. оклад</th>
                  <th className="num">Бонус (листовки)</th>
                  <th className="num">Бонус от прибыли</th>
                  <th className="num">Итого</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <div className="settle-master">
                        <span className="settle-master-name">{r.fullName}</span>
                      </div>
                    </td>
                    <td className="num">{money(r.salaryBase)}</td>
                    <td className="num">{money(r.leafletsPay)}</td>
                    <td className="num">{money(r.closedOrdersBonus)}</td>
                    <td className="num">
                      <strong>{money(r.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
