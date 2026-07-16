'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setSession, AuthUser } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('dispatcher');
  const [password, setPassword] = useState('disp123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<{ accessToken: string; user: AuthUser }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ login, password }),
        },
      );
      setSession(data.accessToken, data.user);
      router.replace('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="panel login-card" onSubmit={onSubmit}>
        <h1 className="page-title">СРМ Сервис</h1>
        <p className="muted" style={{ marginTop: -8 }}>
          Вход для диспетчера и администратора
        </p>
        <div className="field">
          <label htmlFor="login">Логин</label>
          <input
            id="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Входим…' : 'Войти'}
        </button>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          Пилот: dispatcher / disp123 · admin / admin123 · owner / owner123
        </p>
      </form>
    </div>
  );
}
