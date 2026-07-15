'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { ROLE_LABELS, USER_STATUS_LABELS, isAdminRole } from '@/lib/labels';

type User = {
  id: string;
  login: string;
  fullName: string;
  role: string;
  status: string;
  phone?: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [fireId, setFireId] = useState<string | null>(null);
  const [fireForm, setFireForm] = useState({ reason: '', recommendedHire: true });
  const [form, setForm] = useState({
    login: '',
    password: '',
    fullName: '',
    role: 'DISPATCHER',
  });
  const admin = isAdminRole(getStoredUser()?.role ?? '');

  async function load() {
    setUsers(await api<User[]>('/users'));
  }

  useEffect(() => {
    if (!admin) {
      setError('Доступно администратору');
      return;
    }
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [admin]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ login: '', password: '', fullName: '', role: 'DISPATCHER' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function fireUser(id: string) {
    setError('');
    try {
      await api(`/users/${id}/fire`, {
        method: 'POST',
        body: JSON.stringify({
          reason: fireForm.reason || undefined,
          recommendedHire: fireForm.recommendedHire,
        }),
      });
      setFireId(null);
      setFireForm({ reason: '', recommendedHire: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function restoreUser(id: string) {
    setError('');
    try {
      await api(`/users/${id}/restore`, { method: 'POST', body: '{}' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Сотрудники</h1>
      {admin ? (
        <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Логин</label>
              <input
                required
                value={form.login}
                onChange={(e) => setForm({ ...form, login: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Пароль</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ФИО</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Роль</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="DISPATCHER">Диспетчер</option>
                <option value="ADMIN">Администратор</option>
                <option value="DIRECTOR">Директор</option>
                <option value="OWNER">Владелец</option>
              </select>
            </div>
          </div>
          <button className="btn" type="submit">
            Создать сотрудника
          </button>
        </form>
      ) : null}
      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.login}</td>
                <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                <td>{USER_STATUS_LABELS[u.status] ?? u.status}</td>
                <td>
                  {admin && u.status === 'ACTIVE' ? (
                    fireId === u.id ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          placeholder="Причина увольнения"
                          value={fireForm.reason}
                          onChange={(e) =>
                            setFireForm({ ...fireForm, reason: e.target.value })
                          }
                        />
                        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={fireForm.recommendedHire}
                            onChange={(e) =>
                              setFireForm({ ...fireForm, recommendedHire: e.target.checked })
                            }
                          />
                          Рекомендовать
                        </label>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => fireUser(u.id)}
                        >
                          Уволить
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setFireId(null);
                            setFireForm({ reason: '', recommendedHire: true });
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => setFireId(u.id)}
                      >
                        Уволить
                      </button>
                    )
                  ) : admin && u.status === 'FIRED' ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => restoreUser(u.id)}
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
