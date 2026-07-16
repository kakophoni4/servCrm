'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type BotConfig = {
  hasToken: boolean;
  tokenMasked: string;
  source: 'db' | 'env' | 'none';
  enabled: boolean;
  username: string | null;
  mode?: 'polling' | 'webhook';
  connected?: boolean;
};

type TestResult = {
  ok: boolean;
  username?: string | null;
  name?: string | null;
  error?: string;
};

type ConnectResult = {
  ok: boolean;
  mode?: string;
  error?: string;
  description?: string | null;
};

export function BotSettingsPanel() {
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
    setTest(null);
    setSaving(true);
    try {
      const body: { enabled: boolean; token?: string } = { enabled };
      const trimmed = token.trim();
      if (trimmed) body.token = trimmed;

      await api('/settings/bot', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setToken('');

      // На всякий случай ещё раз снимаем webhook (сохранение уже включает polling).
      await api<ConnectResult>('/settings/bot/set-webhook', {
        method: 'POST',
      }).catch(() => null);
      setMsg(
        enabled
          ? 'Сохранено. Бот слушает Telegram через getUpdates (домен не нужен).'
          : 'Сохранено. Бот выключен.',
      );
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

  const botLink = config?.username
    ? `https://t.me/${config.username}`
    : null;
  const statusLabel = !config?.hasToken
    ? 'не настроен'
    : config.enabled
      ? 'включён · getUpdates'
      : 'выключен';

  return (
    <div className="bot-settings">
      <form className="panel bot-settings-form" onSubmit={save}>
        <div className="bot-settings-head">
          <h2 className="bot-settings-title">Telegram-бот</h2>
        </div>

        {config ? (
          <div className="bot-settings-status">
            <span className="muted">Статус</span>
            <strong>
              {botLink ? (
                <a href={botLink} target="_blank" rel="noreferrer">
                  @{config.username}
                </a>
              ) : (
                '—'
              )}
              {' · '}
              {statusLabel}
            </strong>
            {config.hasToken ? (
              <span className="muted bot-settings-masked">
                Токен: {config.tokenMasked}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="muted">Загрузка…</p>
        )}

        <div className="field">
          <label>Токен бота</label>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              config?.hasToken
                ? 'Оставьте пустым, чтобы не менять'
                : 'Токен от @BotFather'
            }
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        <label className="bot-settings-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Бот включён
        </label>

        {error ? <p className="error">{error}</p> : null}
        {msg ? <p className="bot-settings-msg">{msg}</p> : null}

        <div className="bot-settings-actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={runTest}
            disabled={!config?.hasToken}
          >
            Проверить подключение
          </button>
        </div>

        {test ? (
          <p className={test.ok ? 'bot-settings-msg' : 'error'}>
            {test.ok
              ? `Успех: @${test.username ?? '—'} (${test.name ?? ''})`
              : `Ошибка: ${test.error}`}
          </p>
        ) : null}
      </form>
    </div>
  );
}
