'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';

const TABS = [
  {
    href: '/cash',
    label: 'Касса',
    permission: 'cash.read',
    match: (p: string) => p === '/cash' || p.startsWith('/cash/'),
  },
  {
    href: '/assets',
    label: 'Имущество',
    permission: 'assets.read',
    match: (p: string) => p === '/assets' || p.startsWith('/assets/'),
  },
  {
    href: '/ads',
    label: 'Реклама',
    permission: 'ads.read',
    match: (p: string) => p === '/ads' || p.startsWith('/ads/'),
  },
] as const;

export function OpsShell({ children }: { children: React.ReactNode }) {
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
        <h1 className="page-title">Касса и ресурсы</h1>
        <p className="muted">
          Нет доступа к кассе, имуществу или рекламе.
        </p>
      </div>
    );
  }

  return (
    <div className="desk">
      <div className="desk-top">
        <h1 className="page-title desk-title">Касса и ресурсы</h1>
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
