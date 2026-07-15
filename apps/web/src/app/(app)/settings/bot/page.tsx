'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type BotConfig = {
  hasToken: boolean;
  tokenMasked: string;
  source: 'db' | 'env' | 'none';
  enabled: boolean;
  username: string | null;
};

type TestResult = {
  ok: boolean;
  username?: string | null;
  name?: string | null;
  error?: string;
};

const SOURCE_LABELS: Record<BotConfig['source'], string> = {
  db: 'из админки (БД)',
  env: 'из переменной окружения',
  none: 'не задан',
};

export default function BotSettingsPage() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await api<BotConfig>('/settings/bot');
    setConfig(data);
    setEnabled(data.enabled);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      const body: Record<string, unknown> = { enabled };
      if (token.trim()) body.token = token.trim();
      await api('/settings/bot', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setToken('');
      setMsg('Настройки сохранены');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setError('');
    setMsg('');
    setTest(null);
    try {
      const res = await api<TestResult>('/settings/bot/test', {
        method: 'POST',
      });
      setTest(res);
      if (res.ok) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проверки');
    }
  }

  return (
    <div>
      <h1 className="page-title">Настройки Telegram-бота</h1>

      <div className="panel" style={{ marginBottom: 16 }}>
        {config ? (
          <p className="muted">
            Текущий токен: <strong>{config.tokenMasked || '—'}</strong> (
            {SOURCE_LABELS[config.source]})
            {config.username ? ` · @${config.username}` : ''} · бот{' '}
            {config.enabled ? 'включён' : 'выключен'}
          </p>
        ) : (
          <p className="muted">Загрузка…</p>
        )}
      </div>

      <form className="panel" onSubmit={save} style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Новый токен бота (BotFather)</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456789:AA... (оставьте пустым, чтобы не менять)"
            autoComplete="off"
          />
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Бот включён
        </label>

        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button className="btn secondary" type="button" onClick={runTest}>
            Проверить подключение
          </button>
        </div>

        {test ? (
          <p
            style={{ marginTop: 12, color: test.ok ? '#0f766e' : '#b91c1c' }}
          >
            {test.ok
              ? `Успех: @${test.username ?? '—'} (${test.name ?? ''})`
              : `Ошибка: ${test.error}`}
          </p>
        ) : null}
      </form>

      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          Токен хранится в базе и имеет приоритет над переменной окружения
          TELEGRAM_BOT_TOKEN. После смены токена нажмите «Проверить подключение».
        </p>
      </div>
    </div>
  );
}
