'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isAdminRole } from '@/lib/labels';

type Master = {
  id: string;
  status: string;
  user: { fullName: string; phone?: string | null; login: string };
};

export default function MastersPage() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const admin = isAdminRole(getStoredUser()?.role ?? '');

  async function load() {
    setMasters(await api<Master[]>('/masters'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/masters', {
        method: 'POST',
        body: JSON.stringify({ fullName, phone: phone || undefined }),
      });
      setFullName('');
      setPhone('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function deactivate(id: string) {
    if (!confirm('Снять мастера? Открытые заявки останутся без исполнителя.')) {
      return;
    }
    await api(`/masters/${id}/deactivate`, { method: 'POST' });
    await load();
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
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Телефон</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <button className="btn" type="submit">
            Добавить мастера
          </button>
        </form>
      ) : null}
      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Телефон</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {masters.map((m) => (
              <tr key={m.id}>
                <td>{m.user.fullName}</td>
                <td>{m.user.phone ?? '—'}</td>
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
