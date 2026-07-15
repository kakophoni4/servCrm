'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { branchLabel } from '@/lib/branchLabel';
import { ROLE_LABELS } from '@/lib/labels';

type User = {
  id: string;
  fullName: string;
  role: string;
  status?: string;
  cityId?: string | null;
  city?: { id: string; name: string; cityName?: string | null } | null;
};

type City = { id: string; name: string; cityName?: string | null };

type DispatcherPay = {
  salaryBase: string | number;
  dailyTurnoverPct: string | number;
  leafletBonus: string | number;
  closedOrdersBonusPct: string | number;
};

type ScheduleDay = {
  date: string;
  day: number;
  userId: string | null;
  fullName: string | null;
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

const WEEKDAY = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export default function DispatcherPayPage() {
  const now = new Date();
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState('');
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

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [scheduleSaving, setScheduleSaving] = useState<string | null>(null);

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i),
    [now],
  );

  const branchDispatchers = useMemo(
    () =>
      dispatchers.filter((u) => {
        const uid = u.cityId ?? u.city?.id ?? null;
        return !cityId || uid === cityId;
      }),
    [dispatchers, cityId],
  );

  async function loadUsers() {
    const [users, cityList] = await Promise.all([
      api<User[]>('/users'),
      api<City[]>('/cities'),
    ]);
    const list = users.filter(
      (u) => u.role === 'DISPATCHER' && u.status !== 'FIRED',
    );
    setDispatchers(list);
    setCities(cityList);
    const nextCity =
      cityId && cityList.some((c) => c.id === cityId)
        ? cityId
        : cityList[0]?.id ?? '';
    setCityId(nextCity);
    const inBranch = list.filter(
      (u) => (u.cityId ?? u.city?.id ?? null) === nextCity || !nextCity,
    );
    if (!userId || !inBranch.some((u) => u.id === userId)) {
      setUserId(inBranch[0]?.id ?? '');
    }
  }

  async function loadSettings(id: string) {
    const data = await api<DispatcherPay | null>(
      `/settings/dispatcher-pay/${id}`,
    );
    setForm({
      salaryBase: String(data?.salaryBase ?? 0),
      dailyTurnoverPct: String(Number(data?.dailyTurnoverPct ?? 0) * 100),
      leafletBonus: String(data?.leafletBonus ?? 0),
      closedOrdersBonusPct: String(
        Number(data?.closedOrdersBonusPct ?? 0) * 100,
      ),
    });
  }

  async function loadSchedule() {
    if (!cityId) {
      setDays([]);
      return;
    }
    const data = await api<{ days: ScheduleDay[] }>(
      `/settings/dispatcher-schedule?year=${year}&month=${month}&cityId=${encodeURIComponent(cityId)}`,
    );
    setDays(data.days);
  }

  useEffect(() => {
    loadUsers().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadSettings(userId).catch((e) =>
      setError(e instanceof Error ? e.message : 'Ошибка'),
    );
  }, [userId]);

  useEffect(() => {
    loadSchedule().catch((e) =>
      setError(e instanceof Error ? e.message : 'Ошибка графика'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, cityId]);

  useEffect(() => {
    if (!cityId) return;
    const inBranch = dispatchers.filter(
      (u) => (u.cityId ?? u.city?.id ?? null) === cityId,
    );
    if (userId && !inBranch.some((u) => u.id === userId)) {
      setUserId(inBranch[0]?.id ?? '');
    }
  }, [cityId, dispatchers, userId]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError('');
    setMsg('');
    const salaryBase = Number(form.salaryBase);
    const dailyTurnoverPct = Number(form.dailyTurnoverPct) / 100;
    const leafletBonus = Number(form.leafletBonus);
    const closedOrdersBonusPct = Number(form.closedOrdersBonusPct) / 100;
    if (
      [salaryBase, dailyTurnoverPct, leafletBonus, closedOrdersBonusPct].some(
        (n) => Number.isNaN(n),
      )
    ) {
      setError('Проверьте числа в полях ЗП');
      return;
    }
    try {
      await api(`/settings/dispatcher-pay/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          salaryBase,
          dailyTurnoverPct,
          leafletBonus,
          closedOrdersBonusPct,
        }),
      });
      setMsg('Параметры ЗП сохранены');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function assignDay(date: string, nextUserId: string) {
    if (!cityId) {
      setError('Укажите филиал');
      return;
    }
    setError('');
    setMsg('');
    setScheduleSaving(date);
    try {
      await api('/settings/dispatcher-schedule', {
        method: 'PUT',
        body: JSON.stringify({
          date,
          userId: nextUserId || null,
          cityId,
        }),
      });
      await loadSchedule();
      setMsg('График обновлён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка графика');
    } finally {
      setScheduleSaving(null);
    }
  }

  return (
    <div>
      <h1 className="page-title">ЗП диспетчеров</h1>

      <form className="panel" onSubmit={onSave} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Филиал</label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              required
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {branchLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Диспетчер</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {branchDispatchers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({ROLE_LABELS[u.role]})
                </option>
              ))}
            </select>
            {branchDispatchers.length === 0 ? (
              <p className="muted">Нет диспетчеров в этом филиале.</p>
            ) : null}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label>Оклад, ₽</label>
            <input
              inputMode="decimal"
              value={form.salaryBase}
              onChange={(e) => setForm({ ...form, salaryBase: e.target.value })}
            />
          </div>
          <div className="field">
            <label>% от дневного оборота</label>
            <input
              inputMode="decimal"
              placeholder="1"
              value={form.dailyTurnoverPct}
              onChange={(e) =>
                setForm({ ...form, dailyTurnoverPct: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Бонус за 100 листовок, ₽</label>
            <input
              inputMode="decimal"
              value={form.leafletBonus}
              onChange={(e) =>
                setForm({ ...form, leafletBonus: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>% бонус за закрытые заявки</label>
            <input
              inputMode="decimal"
              placeholder="1"
              value={form.closedOrdersBonusPct}
              onChange={(e) =>
                setForm({ ...form, closedOrdersBonusPct: e.target.value })
              }
            />
          </div>
        </div>

        <button className="btn" type="submit" disabled={!userId}>
          Сохранить ЗП
        </button>
      </form>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>График смен</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Смена назначается в выбранном филиале — на ту же дату в другом филиале
          может быть свой диспетчер.
        </p>
        <div className="grid-2" style={{ marginBottom: 12 }}>
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

        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}

        <table className="table">
          <thead>
            <tr>
              <th>День</th>
              <th>Дата</th>
              <th>Диспетчер на смене</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const wd = new Date(`${d.date}T12:00:00`).getDay();
              return (
                <tr key={d.date}>
                  <td>
                    {d.day}{' '}
                    <span className="muted">({WEEKDAY[wd]})</span>
                  </td>
                  <td>
                    {new Date(`${d.date}T12:00:00`).toLocaleDateString('ru-RU')}
                  </td>
                  <td>
                    <select
                      value={d.userId ?? ''}
                      disabled={scheduleSaving === d.date || !cityId}
                      onChange={(e) => assignDay(d.date, e.target.value)}
                      style={{ minWidth: 220 }}
                    >
                      <option value="">— свободно —</option>
                      {branchDispatchers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {days.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  {cityId ? 'Загрузка графика…' : 'Выберите филиал'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
