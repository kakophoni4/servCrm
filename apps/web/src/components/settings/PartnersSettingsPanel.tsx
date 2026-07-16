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
      setError('Укажите название');
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
    <div className="partners-settings">
      <form className="panel partners-form" onSubmit={create}>
        <div className="partners-form-head">
          <h2 className="partners-form-title">Новый партнёр</h2>
        </div>
        <div className="field">
          <label>Название</label>
          <input
            required
            placeholder="Например: Сервис Плюс"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          className="btn partners-form-submit"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Сохранение…' : 'Добавить'}
        </button>
      </form>

      <div className="panel">
        {error ? <p className="error partners-msg">{error}</p> : null}
        {msg ? <p className="partners-ok partners-msg">{msg}</p> : null}
        <div className="table-scroll">
          <table className="table partners-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>
                    {editId === p.id ? (
                      <input
                        className="partners-edit-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      <strong>{p.name}</strong>
                    )}
                  </td>
                  <td>
                    <span className="badge">
                      {p.active ? 'В заявках' : 'Скрыт'}
                    </span>
                  </td>
                  <td>
                    <div className="partners-actions">
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
                    </div>
                  </td>
                </tr>
              ))}
              {partners.length === 0 && !error ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Партнёров пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
