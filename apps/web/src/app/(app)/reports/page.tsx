'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { currentMonthRange } from '@/lib/labels';

type ReportTab =
  | 'closed'
  | 'cancels'
  | 'cash'
  | 'masters'
  | 'claims'
  | 'ads';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'closed', label: 'Закрытые заявки' },
  { id: 'cancels', label: 'Отмены' },
  { id: 'cash', label: 'Касса' },
  { id: 'masters', label: 'Мастера' },
  { id: 'claims', label: 'Претензии' },
  { id: 'ads', label: 'Реклама' },
];

export default function ReportsPage() {
  const defaultRange = currentMonthRange();
  const [tab, setTab] = useState<ReportTab>('closed');
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      let path = '';
      if (tab === 'closed') path = `/reports/closed?from=${from}&to=${to}`;
      else if (tab === 'cancels') path = `/reports/cancels?from=${from}&to=${to}`;
      else if (tab === 'cash') path = `/reports/cash?from=${from}&to=${to}`;
      else if (tab === 'masters') path = `/reports/masters?from=${from}&to=${to}`;
      else if (tab === 'claims') path = `/reports/claims?from=${from}&to=${to}`;
      else path = `/reports/ads?from=${from}&to=${to}`;

      setData(await api(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function renderTable(rows: Record<string, unknown>[]) {
    if (!rows.length) return <p className="muted">Нет данных за период.</p>;
    const keys = Object.keys(rows[0]);
    return (
      <table className="table">
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k}>{formatCell(row[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function formatCell(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function renderData() {
    if (loading) return <p className="muted">Загрузка…</p>;
    if (data == null) return null;

    if (Array.isArray(data)) {
      if (data.length === 0) return <p className="muted">Нет данных за период.</p>;
      if (typeof data[0] === 'object' && data[0] !== null) {
        return renderTable(data as Record<string, unknown>[]);
      }
      return <pre style={{ overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>;
    }

    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return renderTable(obj.items as Record<string, unknown>[]);
      }
      return (
        <table className="table">
          <tbody>
            {Object.entries(obj).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{formatCell(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return <pre>{String(data)}</pre>;
  }

  return (
    <div>
      <h1 className="page-title">Отчёты</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'btn' : 'btn secondary'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>С</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>По</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          Обновить
        </button>
      </div>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {renderData()}
      </div>
    </div>
  );
}
