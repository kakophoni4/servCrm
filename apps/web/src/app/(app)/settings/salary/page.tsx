'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type SalaryCategory = {
  id: string;
  minSum: string | number;
  maxSum?: string | number | null;
  percent: string | number;
  note?: string | null;
};

export default function SalarySettingsPage() {
  const [categories, setCategories] = useState<SalaryCategory[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    minSum: '',
    maxSum: '',
    percent: '',
    note: '',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    minSum: '',
    maxSum: '',
    percent: '',
    note: '',
  });

  async function load() {
    setCategories(await api<SalaryCategory[]>('/salary-categories'));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/salary-categories', {
        method: 'POST',
        body: JSON.stringify({
          minSum: Number(form.minSum),
          maxSum: form.maxSum ? Number(form.maxSum) : null,
          percent: Number(form.percent),
          note: form.note || undefined,
        }),
      });
      setForm({ minSum: '', maxSum: '', percent: '', note: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  function startEdit(c: SalaryCategory) {
    setEditId(c.id);
    setEditForm({
      minSum: String(c.minSum),
      maxSum: c.maxSum != null ? String(c.maxSum) : '',
      percent: String(c.percent),
      note: c.note ?? '',
    });
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setError('');
    try {
      await api(`/salary-categories/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          minSum: Number(editForm.minSum),
          maxSum: editForm.maxSum ? Number(editForm.maxSum) : null,
          percent: Number(editForm.percent),
          note: editForm.note || undefined,
        }),
      });
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function remove(id: string) {
    if (!confirm('Удалить категорию?')) return;
    setError('');
    try {
      await api(`/salary-categories/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Настройки ЗП мастеров</h1>

      <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
        <div className="grid-2">
          <div className="field">
            <label>Мин. сумма, ₽</label>
            <input
              required
              value={form.minSum}
              onChange={(e) => setForm({ ...form, minSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Макс. сумма, ₽ (пусто = без лимита)</label>
            <input
              value={form.maxSum}
              onChange={(e) => setForm({ ...form, maxSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Процент (0.4 = 40%)</label>
            <input
              required
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Примечание</label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <button className="btn" type="submit">
          Добавить категорию
        </button>
      </form>

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>От, ₽</th>
              <th>До, ₽</th>
              <th>%</th>
              <th>Примечание</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) =>
              editId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={5}>
                    <form onSubmit={saveEdit}>
                      <div className="grid-2">
                        <div className="field">
                          <label>Мин.</label>
                          <input
                            value={editForm.minSum}
                            onChange={(e) =>
                              setEditForm({ ...editForm, minSum: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Макс.</label>
                          <input
                            value={editForm.maxSum}
                            onChange={(e) =>
                              setEditForm({ ...editForm, maxSum: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>%</label>
                          <input
                            value={editForm.percent}
                            onChange={(e) =>
                              setEditForm({ ...editForm, percent: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Примечание</label>
                          <input
                            value={editForm.note}
                            onChange={(e) =>
                              setEditForm({ ...editForm, note: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" className="btn">
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => setEditId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{String(c.minSum)}</td>
                  <td>{c.maxSum != null ? String(c.maxSum) : '∞'}</td>
                  <td>{String(Number(c.percent) * 100)}%</td>
                  <td>{c.note ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => startEdit(c)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => remove(c.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Категорий пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
