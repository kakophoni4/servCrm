'use client';

import Link from 'next/link';
import styles from '@/components/desk/DeskLists.module.css';
import { formatRuPhoneDisplay, phoneHref } from '@/lib/phone';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABELS, TYPE_LABELS } from '@/lib/labels';

type Client = {
  id: string;
  name: string;
  phoneNormalized: string;
  branchComment?: string | null;
  ageCategory?: { label: string } | null;
  city?: { name: string } | null;
  orders: Array<{
    id: string;
    publicId: string;
    status: string;
    type: string;
    address: string;
    createdAt: string;
    isClaim: boolean;
    payment?: { paid: string | number; workSum: string | number } | null;
  }>;
};

export default function ClientCardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Client>(`/clients/${id}`)
      .then(setClient)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [id]);

  useEffect(() => {
    if (client && window.location.hash === '#history') {
      document.getElementById('history')?.scrollIntoView({ block: 'start' });
    }
  }, [client]);

  function goOrder(orderId: string) {
    router.push(`/orders/${orderId}`);
  }

  if (!client) {
    return (
      <div className="panel">
        {error ? <p className="error">{error}</p> : <p className="muted">Загрузка…</p>}
      </div>
    );
  }

  return (
    <div className={styles.clientPage}>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className={styles.clientHeading}><h1 className="page-title" style={{margin:0}}>{client.name}</h1><span className={styles.clientCount}>Заявок: {client.orders.length}</span></div>
        <p>
          <a href={phoneHref(client.phoneNormalized)}>{formatRuPhoneDisplay(client.phoneNormalized)}</a>
        </p>

        {client.branchComment ? (
          <p>Комментарий: {client.branchComment}</p>
        ) : null}
      </div>
      <div className="panel" id="history" style={{ scrollMarginTop: 80 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>История заявок</h2>
        <div className={styles.mobileClients}>
          {client.orders.map(o => <Link href={`/orders/${o.id}`} className={styles.clientOrder} key={o.id}>
            <div className={styles.clientHeading}><strong>№ {o.publicId}</strong><span className={`badge ${o.status==='DONE'?'badge-ok':o.status==='WAITING'?styles.waitingBadge:['REFUSAL','CANCELLED_CC'].includes(o.status)?'badge-muted':'badge-work'}`}>{STATUS_LABELS[o.status] ?? o.status}</span></div>
            <div>{o.address || 'Адрес не указан'}</div>
            <div className={styles.orderFoot}><span>{new Date(o.createdAt).toLocaleDateString('ru-RU')}</span><span>{TYPE_LABELS[o.type] ?? o.type}</span>{o.isClaim && <span className="badge badge-warn">Претензия</span>}</div>
            {o.payment && <div className={styles.historyMoney}><span>Оплачено: {Number(o.payment.paid).toLocaleString('ru-RU')} ₽</span><span>Работы: {Number(o.payment.workSum).toLocaleString('ru-RU')} ₽</span></div>}
          </Link>)}
          {!client.orders.length && <p className={styles.orderEmpty}>Заявок пока нет.</p>}
        </div>
        <div className={`table-scroll ${styles.desktopClients}`}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Тип</th>
                <th>Статус</th>
                <th>Адрес</th>
                <th>Оплачено</th>
                <th>Сумма работ</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {client.orders.map((o) => (
                <tr
                  key={o.id}
                  className="row-link"
                  role="link"
                  tabIndex={0}
                  onClick={() => goOrder(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goOrder(o.id);
                    }
                  }}
                >
                  <td>
                    <strong>{o.publicId}</strong>
                    {o.isClaim ? ' ⚠' : ''}
                  </td>
                  <td>{TYPE_LABELS[o.type]}</td>
                  <td><span className={`badge ${o.status==='DONE'?'badge-ok':o.status==='WAITING'?styles.waitingBadge:['REFUSAL','CANCELLED_CC'].includes(o.status)?'badge-muted':'badge-work'}`}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                  <td>{o.address}</td>
                  <td>{o.payment ? `${String(o.payment.paid)} ₽` : '-'}</td>
                  <td>{o.payment ? `${String(o.payment.workSum)} ₽` : '-'}</td>
                  <td>{new Date(o.createdAt).toLocaleString('ru-RU')}</td>
                </tr>
              ))}
              {!client.orders.length&&<tr><td colSpan={7} className="muted">Заявок пока нет.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
