'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';

const TABS = [
  {
    href: '/orders',
    label: 'Заявки',
    permission: 'orders.read',
    match: (p: string) => p === '/orders' || p.startsWith('/orders/'),
  },
  {
    href: '/clients',
    label: 'Клиенты',
    permission: 'clients.read',
    match: (p: string) => p === '/clients' || p.startsWith('/clients/'),
  },
  {
    href: '/claims',
    label: 'Претензии',
    permission: 'claims.read',
    match: (p: string) => p === '/claims' || p.startsWith('/claims/'),
  },
] as const;

export function DeskShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();

  const visibleTabs = useMemo(() => {
    const role = user?.role ?? '';
    const perms = user?.permissions;
    return TABS.filter((tab) => hasPermission(role, perms, tab.permission));
  }, [user?.role, user?.permissions]);

  const currentAllowed = visibleTabs.some((t) => t.match(pathname));

  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!currentAllowed) {
      router.replace(visibleTabs[0].href);
    }
  }, [visibleTabs, currentAllowed, router]);

  if (!visibleTabs.length) {
    return (
      <div className="desk">
        <h1 className="page-title">Заявки и клиенты</h1>
        <p className="muted">Нет доступа к разделам заявок, клиентов или претензий.</p>
      </div>
    );
  }

  return (
    <div className="desk">
      <div className="desk-top">
        <h1 className="page-title desk-title">Заявки и клиенты</h1>
        {visibleTabs.length > 1 ? (
          <nav className="desk-nav" aria-label="Разделы">
            {visibleTabs.map((tab) => {
              const active = tab.match(pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={active ? 'desk-nav-link active' : 'desk-nav-link'}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
      <div className="desk-content">{children}</div>
    </div>
  );
}
