'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ASSET_STATUS_LABELS } from '@/lib/labels';

type Asset = {
  id: string;
  title: string;
  name: string;
  condition?: string | null;
  status: string;
  writtenOffAt?: string | null;
  writeOffNote?: string | null;
  createdAt: string;
  city?: { name: string } | null;
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'WRITTEN_OFF'>('ACTIVE');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', name: '', condition: '' });
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [writeOffNote, setWriteOffNote] = useState('');

  async function load() {
    setAssets(await api<Asset[]>(`/assets?status=${status}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/assets', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          name: form.name,
          condition: form.condition || undefined,
        }),
      });
      setForm({ title: '', name: '', condition: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function writeOff(id: string) {
    setError('');
    try {
      await api(`/assets/${id}/write-off`, {
        method: 'POST',
        body: JSON.stringify({ note: writeOffNote || undefined }),
      });
      setWriteOffId(null);
      setWriteOffNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Имущество</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['ACTIVE', 'WRITTEN_OFF'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={status === s ? 'btn' : 'btn secondary'}
            onClick={() => setStatus(s)}
          >
            {ASSET_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {status === 'ACTIVE' ? (
        <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="grid-2">
            <div className="field">
              <label>Категория / заголовок</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Наименование</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Состояние</label>
              <input
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
              />
            </div>
          </div>
          <button className="btn" type="submit">
            Добавить имущество
          </button>
        </form>
      ) : null}

      <div className="panel">
        {error ? <p className="error">{error}</p> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Категория</th>
              <th>Наименование</th>
              <th>Состояние</th>
              <th>Город</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.name}</td>
                <td>{a.condition ?? '—'}</td>
                <td>{a.city?.name ?? '—'}</td>
                <td>{ASSET_STATUS_LABELS[a.status] ?? a.status}</td>
                <td>
                  {a.status === 'ACTIVE' ? (
                    writeOffId === a.id ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <input
                          placeholder="Причина списания"
                          value={writeOffNote}
                          onChange={(e) => setWriteOffNote(e.target.value)}
                        />
                        <button type="button" className="btn danger" onClick={() => writeOff(a.id)}>
                          Списать
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          onClick={() => {
                            setWriteOffId(null);
                            setWriteOffNote('');
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setWriteOffId(a.id)}
                      >
                        Списать
                      </button>
                    )
                  ) : (
                    <span className="muted">
                      {a.writtenOffAt
                        ? new Date(a.writtenOffAt).toLocaleDateString('ru-RU')
                        : '—'}
                      {a.writeOffNote ? ` · ${a.writeOffNote}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {assets.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Записей нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
