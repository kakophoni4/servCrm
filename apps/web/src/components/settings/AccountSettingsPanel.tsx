'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  ThemePref,
  getStoredThemePref,
  setThemePref,
} from '@/lib/theme';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Системная' },
];

export function AccountSettingsPanel() {
  const [theme, setTheme] = useState<ThemePref>('system');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTheme(getStoredThemePref());
  }, []);

  function onThemeChange(next: ThemePref) {
    setTheme(next);
    setThemePref(next);
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (newPassword.length < 6) {
      setError('Новый пароль не короче 6 символов');
      return;
    }
    if (newPassword !== newPassword2) {
      setError('Пароли не совпадают');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPassword2('');
      setMsg('Пароль изменён');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка смены пароля');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Тема</h2>
        <div className="seg-tabs" role="radiogroup" aria-label="Тема оформления">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={theme === opt.value}
              className={theme === opt.value ? 'active' : ''}
              onClick={() => onThemeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <form className="panel" onSubmit={onPassword}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Сменить пароль</h2>
        <div className="grid-2">
          <div className="field">
            <label>Текущий пароль</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field" />
          <div className="field">
            <label>Новый пароль</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Повтор нового пароля</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
            />
          </div>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {msg ? <p style={{ color: 'var(--accent)' }}>{msg}</p> : null}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Сохранение…' : 'Сменить пароль'}
        </button>
      </form>
    </div>
  );
}
