'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Partner = {
  id: string;
  name: string;
  active: boolean;
};

export function PartnersSettingsPanel() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function load() {
    const data = await api<Partner[]>('/partners/manage');
    setPartners(data);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Укажите название партнёра');
      return;
    }
    setSaving(true);
    try {
      await api('/partners', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setName('');
      setMsg('Партнёр добавлен');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setError('');
    setMsg('');
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('Укажите название');
      return;
    }
    try {
      await api(`/partners/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });
      setEditId(null);
      setMsg('Сохранено');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function toggleActive(p: Partner) {
    setError('');
    setMsg('');
    try {
      await api(`/partners/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !p.active }),
      });
      setMsg(p.active ? 'Партнёр скрыт из заявок' : 'Партнёр снова доступен');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Новый партнёр</h2>
        <form onSubmit={create} className="grid-2">
          <div className="field">
            <label>Название партнёра</label>
            <input
              required
              placeholder="Например: Сервис Плюс"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Сохранение…' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Название</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id}>
                <td>
                  {editId === p.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  ) : (
                    p.name
                  )}
                </td>
                <td>
                  <span className="badge">
                    {p.active ? 'В заявках' : 'Скрыт'}
                  </span>
                </td>
                <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {editId === p.id ? (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => saveEdit(p.id)}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setEditId(null)}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setEditId(p.id);
                        setEditName(p.name);
                      }}
                    >
                      Изменить
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => toggleActive(p)}
                  >
                    {p.active ? 'Скрыть' : 'Показать'}
                  </button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && !error ? (
              <tr>
                <td colSpan={3} className="muted">
                  Партнёров пока нет — добавьте название выше.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
