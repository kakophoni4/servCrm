'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BranchSelect } from '@/components/BranchSelect';
import { api } from '@/lib/api';
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

/** Пн…вс — для календарной сетки. */
const WEEKDAY_MON = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function mondayIndex(jsWeekday: number) {
  return (jsWeekday + 6) % 7;
}

export function DispatcherPayPanel() {
  const now = new Date();
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState('');
  const [dispatchers, setDispatchers] = useState<User[]>([]);
  const [userId, setUserId] = useState('');
  const [form, setForm] = useState({
    salaryBase: '',
    leafletBonus: '',
    closedOrdersBonusPct: '',
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
    const base = Number(data?.salaryBase ?? 0);
    const leaflet = Number(data?.leafletBonus ?? 0);
    const pct = Number(data?.closedOrdersBonusPct ?? 0) * 100;
    setForm({
      salaryBase: base > 0 ? String(base) : '',
      leafletBonus: leaflet > 0 ? String(leaflet) : '',
      closedOrdersBonusPct: pct > 0 ? String(pct) : '',
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
    const leafletBonus = Number(form.leafletBonus);
    const closedOrdersBonusPct = Number(form.closedOrdersBonusPct) / 100;
    if (
      [salaryBase, leafletBonus, closedOrdersBonusPct].some((n) =>
        Number.isNaN(n),
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
          dailyTurnoverPct: 0,
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

  function shortName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) {
      return parts[0].length > 10 ? `${parts[0].slice(0, 9)}…` : parts[0];
    }
    // Коротко в ячейке: «Иванов И.»; длинное первое слово → берём последнее («Пилот»)
    if (parts[0].length > 8) {
      const last = parts[parts.length - 1];
      return last.length > 10 ? `${last.slice(0, 9)}…` : last;
    }
    const label = `${parts[0]} ${parts[1][0]}.`;
    return label.length > 12 ? `${parts[0].slice(0, 9)}…` : label;
  }

  return (
    <div className="dispatcher-pay-panel">
      <form className="panel dispatcher-pay-form" onSubmit={onSave}>
        <div className="dispatcher-pay-head">
          <h2 className="dispatcher-pay-title">Параметры ЗП</h2>
        </div>

        <div className="dispatcher-pay-who">
          <BranchSelect
            cities={cities}
            value={cityId}
            onChange={setCityId}
            required
          />
          <div className="field">
            <label>Диспетчер</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {branchDispatchers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            {branchDispatchers.length === 0 ? (
              <p className="muted field-note">Нет диспетчеров в этом филиале.</p>
            ) : null}
          </div>
        </div>

        <div className="dispatcher-pay-grid">
          <div className="field">
            <label>Месячный оклад, ₽</label>
            <input
              inputMode="decimal"
              placeholder="0"
              value={form.salaryBase}
              onChange={(e) => setForm({ ...form, salaryBase: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Бонус за 100 листовок, ₽</label>
            <input
              inputMode="decimal"
              placeholder="0"
              value={form.leafletBonus}
              onChange={(e) =>
                setForm({ ...form, leafletBonus: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>% от прибыли в смены</label>
            <input
              inputMode="decimal"
              placeholder="0"
              value={form.closedOrdersBonusPct}
              onChange={(e) =>
                setForm({ ...form, closedOrdersBonusPct: e.target.value })
              }
            />
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {msg ? <p className="ok-msg">{msg}</p> : null}

        <button
          className="btn dispatcher-pay-submit"
          type="submit"
          disabled={!userId}
        >
          Сохранить ЗП
        </button>
      </form>

      <div className="panel dispatcher-schedule">
        <div className="panel-period-head dispatcher-schedule-head">
          <h2 className="dispatcher-pay-title panel-period-title">
            График смен
          </h2>
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

        {!cityId ? (
          <p className="muted">Выберите филиал</p>
        ) : days.length === 0 ? (
          <p className="muted">Загрузка графика…</p>
        ) : (
          <div className="schedule-cal">
            <div className="schedule-cal-weekdays">
              {WEEKDAY_MON.map((w) => (
                <div key={w} className="schedule-cal-weekday">
                  {w}
                </div>
              ))}
            </div>
            <div className="schedule-cal-grid">
              {Array.from({
                length: mondayIndex(
                  new Date(`${days[0].date}T12:00:00`).getDay(),
                ),
              }).map((_, i) => (
                <div key={`pad-${i}`} className="schedule-cal-pad" />
              ))}
              {days.map((d) => {
                const wd = new Date(`${d.date}T12:00:00`).getDay();
                const weekend = wd === 0 || wd === 6;
                const assigned = Boolean(d.userId);
                return (
                  <div
                    key={d.date}
                    className={[
                      'schedule-cal-cell',
                      weekend ? 'is-weekend' : '',
                      assigned ? 'is-assigned' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="schedule-cal-day">{d.day}</div>
                    <select
                      className="schedule-cal-select"
                      value={d.userId ?? ''}
                      disabled={scheduleSaving === d.date}
                      title={d.fullName ?? 'Свободно'}
                      onChange={(e) => assignDay(d.date, e.target.value)}
                    >
                      <option value="">—</option>
                      {branchDispatchers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {shortName(u.fullName)}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
