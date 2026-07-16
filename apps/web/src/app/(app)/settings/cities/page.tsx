'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { BotSettingsPanel } from '@/components/settings/BotSettingsPanel';
import { CrmManagePanel } from '@/components/settings/CrmManagePanel';
import { PartnersSettingsPanel } from '@/components/settings/PartnersSettingsPanel';
import { hasPermission } from '@/lib/permissions';

type City = {
  id: string;
  code: string;
  name: string;
  cityName?: string | null;
  active: boolean;
};

type Tab = 'branches' | 'partners' | 'bot' | 'crm';

function OwnerSettingsInner() {
  const user = getStoredUser();
  const role = user?.role ?? '';
  const search = useSearchParams();
  const router = useRouter();
  const isOwner = role === 'OWNER';
  const canCrm = hasPermission(role, user?.permissions, [
    'users.read',
    'settlements.read',
    'salary.read',
    'settings.dispatcher_pay',
  ]);
  const [cities, setCities] = useState<City[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCityName, setEditCityName] = useState('');

  const allowedTabs = useMemo(() => {
    const tabs: Tab[] = [];
    if (isOwner) {
      tabs.push('branches', 'partners', 'bot');
    }
    if (canCrm) tabs.push('crm');
    return tabs;
  }, [isOwner, canCrm]);

  function tabFromSearch(raw: string | null): Tab {
    if (raw === 'bot' && isOwner) return 'bot';
    if (raw === 'partners' && isOwner) return 'partners';
    if (raw === 'crm' && canCrm) return 'crm';
    if (raw === 'branches' && isOwner) return 'branches';
    return allowedTabs[0] ?? 'crm';
  }

  const [tab, setTab] = useState<Tab>(() => tabFromSearch(search.get('tab')));

  async function load() {
    const data = await api<City[]>('/cities/manage');
    setCities(data);
  }

  useEffect(() => {
    if (!isOwner && !canCrm) {
      setError('Недостаточно прав для настроек');
      return;
    }
    if (isOwner) {
      load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    }
  }, [isOwner, canCrm]);

  useEffect(() => {
    setTab(tabFromSearch(search.get('tab')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isOwner, canCrm, allowedTabs]);

  function selectTab(next: Tab) {
    if (!allowedTabs.includes(next)) return;
    setTab(next);
    const q =
      next === 'bot'
        ? '?tab=bot'
        : next === 'partners'
          ? '?tab=partners'
          : next === 'crm'
            ? '?tab=crm'
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
          code,
          name,
          cityName: cityName || undefined,
        }),
      });
      setCode('');
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

  if (role && !isOwner && !canCrm) {
    return (
      <div className="panel">
        <p className="error">Недостаточно прав для настроек.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Настройки</h1>

      <div className="seg-tabs" role="tablist">
        {isOwner ? (
          <>
            <button
              type="button"
              role="tab"
              className={tab === 'branches' ? 'active' : ''}
              onClick={() => selectTab('branches')}
            >
              Филиалы
            </button>
            <button
              type="button"
              role="tab"
              className={tab === 'partners' ? 'active' : ''}
              onClick={() => selectTab('partners')}
            >
              Партнёры
            </button>
            <button
              type="button"
              role="tab"
              className={tab === 'bot' ? 'active' : ''}
              onClick={() => selectTab('bot')}
            >
              Бот Telegram
            </button>
          </>
        ) : null}
        {canCrm ? (
          <button
            type="button"
            role="tab"
            className={tab === 'crm' ? 'active' : ''}
            onClick={() => selectTab('crm')}
          >
            Управление CRM
          </button>
        ) : null}
      </div>

      {tab === 'crm' ? (
        <CrmManagePanel />
      ) : tab === 'bot' ? (
        <BotSettingsPanel />
      ) : tab === 'partners' ? (
        <PartnersSettingsPanel />
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Новый филиал</h2>
            <form onSubmit={create} className="grid-2">
              <div className="field">
                <label>Код (латиница, уникальный)</label>
                <input
                  required
                  placeholder="msk-north"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
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
              <div className="field">
                <label>Город</label>
                <input
                  required
                  placeholder="Москва"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                />
              </div>
              <div>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Создание…' : 'Создать'}
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
                  <th>Код</th>
                  <th>Филиал</th>
                  <th>Город</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <code>{c.code}</code>
                    </td>
                    <td>
                      {editId === c.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      ) : (
                        c.name
                      )}
                    </td>
                    <td>
                      {editId === c.id ? (
                        <input
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
                    <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                    </td>
                  </tr>
                ))}
                {cities.length === 0 && !error ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Филиалов пока нет. В одном городе можно создать несколько.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
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
