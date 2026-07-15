'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isAdminRole } from '@/lib/labels';

type Master = {
  id: string;
  status: string;
  user: {
    fullName: string;
    phone?: string | null;
    login: string;
    telegramId?: string | null;
  };
};

type City = { id: string; name: string };

type Tab = 'ACTIVE' | 'FIRED';

const emptyForm = {
  fullName: '',
  phone: '',
  telegramId: '',
  login: '',
  password: '',
  cityId: '',
};

export default function MastersPage() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const admin = isAdminRole(getStoredUser()?.role ?? '');

  async function load(status: Tab = tab) {
    const path = status === 'FIRED' ? '/masters?all=1' : '/masters';
    const list = await api<Master[]>(path);
    setMasters(
      status === 'FIRED' ? list.filter((m) => m.status === 'FIRED') : list,
    );
  }

  useEffect(() => {
    if (admin) {
      api<City[]>('/cities')
        .then(setCities)
        .catch(() => setCities([]));
    }
  }, [admin]);

  useEffect(() => {
    load(tab).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/masters', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone || undefined,
          telegramId: form.telegramId || undefined,
          login: form.login || undefined,
          password: form.password || undefined,
          cityId: form.cityId || undefined,
        }),
      });
      setForm(emptyForm);
      setTab('ACTIVE');
      await load('ACTIVE');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function deactivate(id: string) {
    if (!confirm('Снять мастера? Открытые заявки останутся без исполнителя.')) {
      return;
    }
    setError('');
    try {
      await api(`/masters/${id}/deactivate`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function restore(id: string) {
    setError('');
    try {
      await api(`/masters/${id}/restore`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Мастера</h1>
      {admin ? (
        <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>ФИО</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Телефон</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Telegram ID</label>
              <input
                value={form.telegramId}
                onChange={(e) =>
                  setForm({ ...form, telegramId: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label>Город</label>
              <select
                value={form.cityId}
                onChange={(e) => setForm({ ...form, cityId: e.target.value })}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Логин</label>
              <input
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                placeholder="авто, если пусто"
              />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="master123, если пусто"
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Добавить мастера
          </button>
        </form>
      ) : null}
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className={tab === 'ACTIVE' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('ACTIVE')}
          >
            Активные
          </button>
          <button
            type="button"
            className={tab === 'FIRED' ? 'btn' : 'btn secondary'}
            onClick={() => setTab('FIRED')}
          >
            Уволенные
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Телефон</th>
              <th>Telegram</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {masters.map((m) => (
              <tr key={m.id}>
                <td>{m.user.fullName}</td>
                <td>{m.user.phone ?? '—'}</td>
                <td>{m.user.telegramId ?? '—'}</td>
                <td>{m.status === 'ACTIVE' ? 'Активен' : 'Уволен'}</td>
                <td>
                  {admin && m.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => deactivate(m.id)}
                    >
                      Снять
                    </button>
                  ) : admin && m.status === 'FIRED' ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => restore(m.id)}
                    >
                      Восстановить
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
