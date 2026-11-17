'use client';

import styles from './DeskLists.module.css';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { formatRuPhoneDisplay, phoneHref } from '@/lib/phone';
import { hasPermission } from '@/lib/permissions';

type Client = {
  id: string;
  name: string;
  phoneNormalized: string;
  ageCategory?: { label: string } | null;
  city?: { name: string } | null;
  _count: { orders: number };
};

export function ClientsPanel() {
  const router = useRouter();
  const user = getStoredUser();
  const canRead = hasPermission(
    user?.role ?? '',
    user?.permissions,
    'clients.read',
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRead) return;
    api<Client[]>('/clients')
      .then(setClients)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Ошибка';
        if (msg !== 'Недостаточно прав') setError(msg);
      });
  }, [canRead]);

  function go(id: string) {
    router.push(`/clients/${id}`);
  }

  if (!canRead) return null;

  return (
    <section className={`desk-panel ${styles.list} ${styles.clients}`}>
      <div className="desk-panel-body">
        {error ? <p className="error">{error}</p> : null}
        <div className={styles.mobileClients}>
          {clients.map(c => <article key={c.id} className={styles.clientCard}>
            <div className={styles.clientHeading}>
              <Link href={`/clients/${c.id}`} className={styles.clientName}>{c.name}</Link>
              <span className={styles.clientCount}>Заявок: <strong>{c._count.orders}</strong></span>
            </div>
            <div className={styles.clientActions}>
              <a href={phoneHref(c.phoneNormalized)} className={styles.clientPhone} aria-label={`Позвонить: ${c.name}`}>{formatRuPhoneDisplay(c.phoneNormalized)}</a>
              <Link href={`/clients/${c.id}#history`} className={styles.clientHistory} aria-label={`История заявок: ${c.name}`}>История <span aria-hidden="true">›</span></Link>
            </div>
          </article>)}
          {!clients.length && !error && <p className={styles.orderEmpty}>Клиентов пока нет.</p>}
        </div>
        <div className={`table-scroll ${styles.desktopClients}`}>
          <table className="table desk-list">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th className="desk-col-center">Возраст</th>
                <th className="desk-col-center">Филиал</th>
                <th className="desk-col-center">Заявок</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="row-link"
                  role="link"
                  tabIndex={0}
                  onClick={() => go(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      go(c.id);
                    }
                  }}
                >
                  <td data-label="Клиент">
                    <div className="desk-cell">
                      <div className="desk-cell-main">{c.name}</div>
                    </div>
                  </td>
                  <td data-label="Телефон">
                    <span className="desk-cell-phone">
                      {formatRuPhoneDisplay(c.phoneNormalized)}
                    </span>
                  </td>
                  <td className="desk-col-center" data-label="Возраст">
                    {c.ageCategory?.label ? (
                      <span className="desk-cell-main">{c.ageCategory.label}</span>
                    ) : (
                      <span className="desk-cell-sub">-</span>
                    )}
                  </td>
                  <td className="desk-col-center" data-label="Филиал">
                    {c.city?.name ? (
                      <span className="desk-cell-main">{c.city.name}</span>
                    ) : (
                      <span className="desk-cell-sub">-</span>
                    )}
                  </td>
                  <td className="desk-col-center" data-label="Заявок">
                    <span className="desk-count">{c._count.orders}</span>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && !error ? (
                <tr>
                  <td colSpan={5} className="muted desk-col-center">
                    Клиентов пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
