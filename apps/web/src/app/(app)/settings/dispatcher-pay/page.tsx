'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';

type User = {
  id: string;
  fullName: string;
  role: string;
};

type DispatcherPay = {
  salaryBase: string | number;
  dailyTurnoverPct: string | number;
  leafletBonus: string | number;
  closedOrdersBonusPct: string | number;
};

export default function DispatcherPayPage() {
  const [dispatchers, setDispatchers] = useState<User[]>([]);
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState({
    salaryBase: '0',
    dailyTurnoverPct: '0',
    leafletBonus: '0',
    closedOrdersBonusPct: '0',
  });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function loadUsers() {
    const users = await api<User[]>('/users');
    const list = users.filter((u) => u.role === 'DISPATCHER');
    setDispatchers(list);
    if (!userId && list[0]) setUserId(list[0].id);
  }

  async function loadSettings(id: string) {
    const data = await api<DispatcherPay>(`/settings/dispatcher-pay/${id}`);
    setForm({
      salaryBase: String(data.salaryBase ?? 0),
      dailyTurnoverPct: String(data.dailyTurnoverPct ?? 0),
      leafletBonus: String(data.leafletBonus ?? 0),
      closedOrdersBonusPct: String(data.closedOrdersBonusPct ?? 0),
    });
  }

  useEffect(() => {
    loadUsers().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadSettings(userId).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [userId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError('');
    setMsg('');
    try {
      await api(`/settings/dispatcher-pay/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          salaryBase: Number(form.salaryBase),
          dailyTurnoverPct: Number(form.dailyTurnoverPct),
          leafletBonus: Number(form.leafletBonus),
          closedOrdersBonusPct: Number(form.closedOrdersBonusPct),
        }),
      });
      setMsg('Сохранено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">ЗП диспетчеров</h1>

      <form className="panel" onSubmit={onSave}>
        <div className="field">
          <label>Диспетчер</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {dispatchers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} ({ROLE_LABELS[u.role]})
              </option>
            ))}
          </select>
          {dispatchers.length === 0 ? (
            <p className="muted">Нет диспетчеров в системе.</p>
          ) : null}
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Оклад, ₽</label>
            <input
              value={form.salaryBase}
              onChange={(e) => setForm({ ...form, salaryBase: e.target.value })}
            />
          </div>
          <div className="field">
            <label>% от дневного оборота (0.01 = 1%)</label>
            <input
              value={form.dailyTurnoverPct}
              onChange={(e) => setForm({ ...form, dailyTurnoverPct: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Бонус за листовки, ₽</label>
            <input
              value={form.leafletBonus}
              onChange={(e) => setForm({ ...form, leafletBonus: e.target.value })}
            />
          </div>
          <div className="field">
            <label>% бонус за закрытые заявки</label>
            <input
              value={form.closedOrdersBonusPct}
              onChange={(e) =>
                setForm({ ...form, closedOrdersBonusPct: e.target.value })
              }
            />
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}

        <button className="btn" type="submit" disabled={!userId}>
          Сохранить
        </button>
      </form>
    </div>
  );
}
