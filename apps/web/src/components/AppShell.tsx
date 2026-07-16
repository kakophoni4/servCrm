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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

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

  const navLinks = NAV.filter((item) => {
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
        onClick={() => setNavOpen(false)}
      >
        <NavIcon href={item.href} className="nav-icon" />
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Закрыть меню"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-head">
          <div className="brand">СРМ Сервис</div>
          <button
            type="button"
            className="nav-close"
            aria-label="Закрыть меню"
            onClick={() => setNavOpen(false)}
          >
            ×
          </button>
        </div>
        <nav>{navLinks}</nav>
      </aside>
      <div className="app-content">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Открыть меню"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen(true)}
          >
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
          </button>
          <div className="topbar-brand-mobile">СРМ Сервис</div>
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
