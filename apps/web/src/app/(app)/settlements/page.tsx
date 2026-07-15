'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { currentMonthRange } from '@/lib/labels';

type Master = { id: string; user: { fullName: string } };

type Settlement = {
  id: string;
  amount: string | number;
  periodFrom: string;
  periodTo: string;
  confirmedOnce: boolean;
  confirmedTwice: boolean;
  confirmedAt?: string | null;
  createdAt: string;
  master: { user: { fullName: string } };
  confirmedBy?: { fullName: string } | null;
};

export default function SettlementsPage() {
  const range = currentMonthRange();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    masterId: '',
    amount: '',
    periodFrom: range.from,
    periodTo: range.to,
  });

  async function load() {
    const [list, m] = await Promise.all([
      api<Settlement[]>('/settlements'),
      api<Master[]>('/masters'),
    ]);
    setSettlements(list);
    setMasters(m);
    if (!form.masterId && m[0]) setForm((f) => ({ ...f, masterId: m[0].id }));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await api('/settlements', {
        method: 'POST',
        body: JSON.stringify({
          masterId: form.masterId,
          amount: Number(form.amount),
          periodFrom: form.periodFrom,
          periodTo: form.periodTo,
        }),
      });
      setForm((f) => ({ ...f, amount: '' }));
      setMsg('Расчёт создан');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function confirm(id: string, once: boolean, twice: boolean) {
    setError('');
    setMsg('');
    try {
      await api(`/settlements/${id}/confirm`, { method: 'POST', body: '{}' });
      setMsg(
        !once
          ? 'Первое подтверждение выполнено'
          : !twice
            ? 'Второе подтверждение выполнено — расчёт закрыт'
            : 'Подтверждено',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Расчёт мастеров</h1>

      <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Мастер</label>
            <select
              value={form.masterId}
              onChange={(e) => setForm({ ...form, masterId: e.target.value })}
            >
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Сумма, ₽</label>
            <input
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Период с</label>
            <input
              type="date"
              value={form.periodFrom}
              onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Период по</label>
            <input
              type="date"
              value={form.periodTo}
              onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
            />
          </div>
        </div>
        <button className="btn" type="submit">
          Создать расчёт
        </button>
      </form>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}
        <p className="muted">
          Для выплаты требуется двойное подтверждение: сначала «Подтвердить (1)», затем
          «Подтвердить (2)».
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Мастер</th>
              <th>Период</th>
              <th>Сумма</th>
              <th>Подтверждения</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => (
              <tr key={s.id}>
                <td>{s.master.user.fullName}</td>
                <td>
                  {new Date(s.periodFrom).toLocaleDateString('ru-RU')} —{' '}
                  {new Date(s.periodTo).toLocaleDateString('ru-RU')}
                </td>
                <td>{String(s.amount)}</td>
                <td>
                  {s.confirmedOnce ? '✓1' : '○1'}{' '}
                  {s.confirmedTwice ? '✓2' : '○2'}
                  {s.confirmedBy ? (
                    <span className="muted"> · {s.confirmedBy.fullName}</span>
                  ) : null}
                </td>
                <td>
                  {!s.confirmedOnce ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => confirm(s.id, false, false)}
                    >
                      Подтвердить (1)
                    </button>
                  ) : !s.confirmedTwice ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => confirm(s.id, true, false)}
                    >
                      Подтвердить (2)
                    </button>
                  ) : (
                    <span className="muted">Закрыт</span>
                  )}
                </td>
              </tr>
            ))}
            {settlements.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
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
