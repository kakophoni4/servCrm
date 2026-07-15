'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AuthUser,
  clearSession,
  getStoredUser,
  getToken,
} from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';

const NAV = [
  { href: '/orders', label: 'Заявки' },
  { href: '/orders/new', label: 'Новая заявка' },
  { href: '/clients', label: 'Клиенты' },
  { href: '/claims', label: 'Претензии' },
  { href: '/cash', label: 'Касса' },
  { href: '/reports', label: 'Отчёты' },
  { href: '/ads', label: 'Реклама' },
  { href: '/assets', label: 'Имущество' },
  { href: '/chat', label: 'Чат' },
  { href: '/settlements', label: 'Расчёт мастеров' },
  { href: '/settings/salary', label: 'Настройки ЗП' },
  { href: '/settings/dispatcher-pay', label: 'ЗП диспетчеров' },
  { href: '/masters', label: 'Мастера' },
  { href: '/users', label: 'Сотрудники' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!user) {
    return (
      <div className="main">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Field CRM</div>
        <nav>
          {NAV.map((item) => {
            const active =
              item.href === '/orders'
                ? pathname === '/orders' ||
                  (pathname.startsWith('/orders/') &&
                    !pathname.startsWith('/orders/new'))
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'active' : ''}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="user">
          <div>{user.fullName}</div>
          <div>{ROLE_LABELS[user.role] ?? user.role}</div>
          <button type="button" className="btn secondary" style={{ marginTop: 8 }} onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
