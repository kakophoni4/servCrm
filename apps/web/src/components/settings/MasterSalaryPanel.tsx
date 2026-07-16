'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type SalaryCategory = {
  id: string;
  minSum: string | number;
  maxSum?: string | number | null;
  percent: string | number;
};

function money(n: string | number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString('ru-RU');
}

export function MasterSalaryPanel() {
  const [categories, setCategories] = useState<SalaryCategory[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    minSum: '',
    maxSum: '',
    percent: '40',
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    minSum: '',
    maxSum: '',
    percent: '',
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
          percent: Number(form.percent) / 100,
        }),
      });
      setForm({ minSum: '', maxSum: '', percent: '40' });
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
      percent: String(Number(c.percent) * 100),
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
          percent: Number(editForm.percent) / 100,
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
    <div className="salary-panel">
      <form className="panel salary-create" onSubmit={onCreate}>
        <div className="salary-create-head">
          <h2 className="salary-create-title">Новая категория</h2>
          <p className="muted salary-create-hint">
            Диапазон суммы работ и процент ЗП мастера
          </p>
        </div>

        <div className="salary-create-grid">
          <div className="field">
            <label>Мин. сумма, ₽</label>
            <input
              required
              inputMode="decimal"
              placeholder="0"
              value={form.minSum}
              onChange={(e) => setForm({ ...form, minSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Макс. сумма, ₽</label>
            <input
              inputMode="decimal"
              placeholder="без лимита"
              value={form.maxSum}
              onChange={(e) => setForm({ ...form, maxSum: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Процент, %</label>
            <input
              required
              inputMode="decimal"
              placeholder="40"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: e.target.value })}
            />
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <button className="btn" type="submit">
          Добавить категорию
        </button>
      </form>

      <div className="panel">
        <h2 className="salary-list-title">Категории</h2>
        <table className="table salary-table">
          <thead>
            <tr>
              <th>От, ₽</th>
              <th>До, ₽</th>
              <th>%</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) =>
              editId === c.id ? (
                <tr key={c.id} className="salary-edit-row">
                  <td colSpan={4}>
                    <form onSubmit={saveEdit} className="salary-edit-form">
                      <div className="salary-create-grid">
                        <div className="field">
                          <label>Мин., ₽</label>
                          <input
                            required
                            inputMode="decimal"
                            value={editForm.minSum}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                minSum: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Макс., ₽</label>
                          <input
                            inputMode="decimal"
                            placeholder="без лимита"
                            value={editForm.maxSum}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                maxSum: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="field">
                          <label>Процент, %</label>
                          <input
                            required
                            inputMode="decimal"
                            value={editForm.percent}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                percent: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="salary-edit-actions">
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
                  <td>{money(c.minSum)}</td>
                  <td>{c.maxSum != null ? money(c.maxSum) : '∞'}</td>
                  <td>
                    <span className="salary-pct">
                      {(Number(c.percent) * 100).toLocaleString('ru-RU')}%
                    </span>
                  </td>
                  <td>
                    <div className="salary-row-actions">
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => startEdit(c)}
                      >
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="btn-link salary-remove"
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
                <td colSpan={4} className="muted">
                  Категорий пока нет — добавьте первую выше.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
