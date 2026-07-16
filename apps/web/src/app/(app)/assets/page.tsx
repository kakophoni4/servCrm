'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AutoTextarea } from '@/components/AutoTextarea';
import { BranchSelect } from '@/components/BranchSelect';
import { OpsShell } from '@/components/ops/OpsShell';
import { api, getStoredUser } from '@/lib/api';
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

type City = { id: string; name: string };

export default function AssetsPage() {
  const isOwner = (getStoredUser()?.role ?? '') === 'OWNER';
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'WRITTEN_OFF'>('ACTIVE');
  const [cityFilter, setCityFilter] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    name: '',
    condition: '',
    cityId: '',
  });
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [writeOffNote, setWriteOffNote] = useState('');

  async function load() {
    const q = new URLSearchParams({ status });
    if (cityFilter) q.set('cityId', cityFilter);
    setAssets(await api<Asset[]>(`/assets?${q}`));
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cityFilter]);

  useEffect(() => {
    api<City[]>('/cities')
      .then((list) => {
        setCities(list);
        if (list[0]) setForm((f) => ({ ...f, cityId: f.cityId || list[0].id }));
      })
      .catch(() => undefined);
  }, []);

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
          cityId: form.cityId || undefined,
        }),
      });
      setForm((f) => ({ title: '', name: '', condition: '', cityId: f.cityId }));
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
    <OpsShell>
      <div className="asset-page">
        <div className="asset-toolbar">
          <div className="asset-tabs" role="group" aria-label="Статус имущества">
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
          <div className="field asset-filter">
            <label>Филиал</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              <option value="">{isOwner ? 'Все филиалы' : 'Мой филиал'}</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {status === 'ACTIVE' ? (
          <form className="panel asset-form" onSubmit={onCreate}>
            <div className="asset-form-head">
              <h2 className="asset-form-title">Новое имущество</h2>
            </div>
            <div className="asset-form-row">
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
                  onChange={(e) =>
                    setForm({ ...form, condition: e.target.value })
                  }
                />
              </div>
              <BranchSelect
                cities={cities}
                value={form.cityId}
                onChange={(cityId) => setForm({ ...form, cityId })}
                allowEmpty
              />
            </div>
            <button className="btn asset-form-submit" type="submit">
              Добавить имущество
            </button>
          </form>
        ) : null}

        <div className="panel">
          {error ? <p className="error">{error}</p> : null}
          <div className="table-scroll">
            <table className="table asset-table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Наименование</th>
                  <th>Состояние</th>
                  <th>Филиал</th>
                  <th>{status === 'WRITTEN_OFF' ? 'Списание' : 'Действия'}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{a.name}</td>
                    <td>{a.condition ?? '—'}</td>
                    <td>{a.city?.name ?? '—'}</td>
                    <td>
                      {a.status === 'ACTIVE' ? (
                        writeOffId === a.id ? (
                          <div className="asset-writeoff">
                            <AutoTextarea
                              placeholder="Причина списания"
                              value={writeOffNote}
                              onChange={(e) => setWriteOffNote(e.target.value)}
                            />
                            <div className="asset-writeoff-actions">
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() => writeOff(a.id)}
                              >
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
                            ? new Date(a.writtenOffAt).toLocaleDateString(
                                'ru-RU',
                              )
                            : '—'}
                          {a.writeOffNote ? ` · ${a.writeOffNote}` : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Записей нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </OpsShell>
  );
}
