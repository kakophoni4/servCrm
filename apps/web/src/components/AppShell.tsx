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
import { hasPermission } from '@/lib/permissions';
import { NavIcon } from './NavIcons';
import { NewOrderNotifier } from './NewOrderNotifier';

type NavItem = {
  href: string;
  label: string;
  roles?: string[];
  /** Хотя бы одно из прав (для ADMIN/DIRECTOR с явным списком). */
  anyOf?: string[];
};

const NAV: NavItem[] = [
  {
    href: '/chat',
    label: 'Чаты',
    roles: ['ADMIN', 'DIRECTOR', 'OWNER'],
    anyOf: ['chat.read'],
  },
  {
    href: '/orders',
    label: 'Заявки и клиенты',
    anyOf: ['orders.read', 'clients.read', 'claims.read'],
  },
  {
    href: '/cash',
    label: 'Касса и ресурсы',
    roles: ['ADMIN', 'DIRECTOR', 'OWNER'],
    anyOf: ['cash.read', 'assets.read', 'ads.read'],
  },
  {
    href: '/reports',
    label: 'Отчёты',
    roles: ['DIRECTOR', 'OWNER'],
    anyOf: ['reports.read'],
  },
  {
    href: '/manage',
    label: 'Управление CRM',
    roles: ['ADMIN', 'DIRECTOR', 'OWNER'],
    anyOf: [
      'users.read',
      'settlements.read',
      'salary.read',
      'settings.dispatcher_pay',
    ],
  },
  {
    href: '/settings/cities',
    label: 'Настройки',
    roles: ['OWNER'],
  },
  {
    href: '/settings/account',
    label: 'Аккаунт',
  },
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
        <div className="brand">СРМ Сервис</div>
        <nav>
          {NAV.filter((item) => {
            if (item.roles && !item.roles.includes(user.role)) return false;
            if (
              item.anyOf?.length &&
              !hasPermission(user.role, user.permissions, item.anyOf)
            ) {
              return false;
            }
            return true;
          }).map((item) => {
            const active =
              item.href === '/orders'
                ? pathname === '/orders' ||
                  pathname.startsWith('/orders/') ||
                  pathname.startsWith('/clients') ||
                  pathname.startsWith('/claims')
                : item.href === '/cash'
                  ? pathname.startsWith('/cash') ||
                    pathname.startsWith('/assets') ||
                    pathname.startsWith('/ads')
                  : item.href === '/manage'
                    ? pathname.startsWith('/manage') ||
                      pathname.startsWith('/settlements') ||
                      pathname.startsWith('/settings/salary') ||
                      pathname.startsWith('/settings/dispatcher-pay') ||
                      pathname.startsWith('/users') ||
                      pathname.startsWith('/masters')
                    : item.href === '/settings/cities'
                      ? pathname.startsWith('/settings/cities') ||
                        pathname.startsWith('/settings/bot')
                      : item.href === '/settings/account'
                        ? pathname.startsWith('/settings/account')
                        : pathname === item.href ||
                          pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? 'active' : ''}
              >
                <NavIcon href={item.href} className="nav-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <div className="topbar-spacer" />
          <div className="topbar-user">
            <div className="topbar-user-meta">
              <div className="topbar-user-name">{user.fullName}</div>
              <div className="topbar-user-role">
                {ROLE_LABELS[user.role] ?? user.role}
              </div>
            </div>
            <button
              type="button"
              className="btn secondary topbar-logout"
              onClick={logout}
            >
              Выйти
            </button>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
      <NewOrderNotifier />
    </div>
  );
}
