'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { BotSettingsPanel } from '@/components/settings/BotSettingsPanel';
import { PartnersSettingsPanel } from '@/components/settings/PartnersSettingsPanel';

type City = {
  id: string;
  code: string;
  name: string;
  cityName?: string | null;
  active: boolean;
};

type Tab = 'branches' | 'partners' | 'bot';

function tabFromSearch(raw: string | null): Tab {
  if (raw === 'bot') return 'bot';
  if (raw === 'partners') return 'partners';
  // старые ссылки ?tab=crm → уводим в /manage
  return 'branches';
}

function OwnerSettingsInner() {
  const role = getStoredUser()?.role ?? '';
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => tabFromSearch(search.get('tab')));
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCityName, setEditCityName] = useState('');

  async function load() {
    const data = await api<City[]>('/cities/manage');
    setCities(data);
  }

  useEffect(() => {
    if (search.get('tab') === 'crm') {
      const q = new URLSearchParams();
      const section = search.get('section');
      const who = search.get('who');
      if (section) q.set('section', section);
      if (who) q.set('who', who);
      router.replace(`/manage${q.toString() ? `?${q}` : ''}`);
      return;
    }
  }, [search, router]);

  useEffect(() => {
    if (role !== 'OWNER') {
      setError('Настройки доступны только владельцу');
      return;
    }
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [role]);

  useEffect(() => {
    setTab(tabFromSearch(search.get('tab')));
  }, [search]);

  function selectTab(next: Tab) {
    setTab(next);
    const q =
      next === 'bot'
        ? '?tab=bot'
        : next === 'partners'
          ? '?tab=partners'
          : '';
    router.replace(`/settings/cities${q}`);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      await api('/cities', {
        method: 'POST',
        body: JSON.stringify({
          name,
          cityName: cityName || undefined,
        }),
      });
      setName('');
      setCityName('');
      setMsg('Филиал создан');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка создания');
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    setError('');
    setMsg('');
    try {
      await api(`/cities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          cityName: editCityName,
        }),
      });
      setEditId(null);
      setMsg('Филиал обновлён');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  }

  async function toggleActive(city: City) {
    setError('');
    setMsg('');
    try {
      await api(`/cities/${city.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !city.active }),
      });
      setMsg(city.active ? 'Филиал отключён' : 'Филиал включён');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  if (role && role !== 'OWNER') {
    return (
      <div className="panel">
        <p className="error">Настройки доступны только владельцу.</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1 className="page-title settings-page-title">Настройки</h1>

      <div className="settings-tabs" role="tablist" aria-label="Разделы настроек">
        <button
          type="button"
          role="tab"
          className={tab === 'branches' ? 'btn' : 'btn secondary'}
          onClick={() => selectTab('branches')}
        >
          Филиалы
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'partners' ? 'btn' : 'btn secondary'}
          onClick={() => selectTab('partners')}
        >
          Партнёры
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'bot' ? 'btn' : 'btn secondary'}
          onClick={() => selectTab('bot')}
        >
          Бот Telegram
        </button>
      </div>

      {tab === 'bot' ? (
        <BotSettingsPanel />
      ) : tab === 'partners' ? (
        <PartnersSettingsPanel />
      ) : (
        <div className="settings-section">
          <form className="panel branch-form" onSubmit={create}>
            <div className="branch-form-head">
              <h2 className="branch-form-title">Новый филиал</h2>
            </div>
            <div className="branch-form-row">
              <div className="field">
                <label>Город</label>
                <input
                  required
                  placeholder="Москва"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Название филиала</label>
                <input
                  required
                  placeholder="Север / ТЦ Галерея"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <button
              className="btn branch-form-submit"
              type="submit"
              disabled={saving}
            >
              {saving ? 'Создание…' : 'Создать'}
            </button>
          </form>

          <div className="panel">
            {error ? <p className="error">{error}</p> : null}
            {msg ? <p className="ok-msg">{msg}</p> : null}
            <div className="table-scroll">
              <table className="table branch-table">
                <thead>
                  <tr>
                    <th>Филиал</th>
                    <th>Город</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {editId === c.id ? (
                          <input
                            className="branch-edit-input"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          <strong>{c.name}</strong>
                        )}
                      </td>
                      <td>
                        {editId === c.id ? (
                          <input
                            className="branch-edit-input"
                            value={editCityName}
                            onChange={(e) => setEditCityName(e.target.value)}
                            placeholder="Город"
                          />
                        ) : (
                          c.cityName || '—'
                        )}
                      </td>
                      <td>
                        <span className="badge">
                          {c.active ? 'Активен' : 'Выключен'}
                        </span>
                      </td>
                      <td>
                        <div className="branch-row-actions">
                          {editId === c.id ? (
                            <>
                              <button
                                type="button"
                                className="btn"
                                onClick={() => saveEdit(c.id)}
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
                                setEditId(c.id);
                                setEditName(c.name);
                                setEditCityName(c.cityName ?? '');
                              }}
                            >
                              Изменить
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => toggleActive(c)}
                          >
                            {c.active ? 'Выключить' : 'Включить'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cities.length === 0 && !error ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Филиалов пока нет. В одном городе можно создать несколько.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OwnerSettingsPage() {
  return (
    <Suspense fallback={<p className="muted">Загрузка…</p>}>
      <OwnerSettingsInner />
    </Suspense>
  );
}
