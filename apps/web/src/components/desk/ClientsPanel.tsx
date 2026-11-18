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
  const [revision,setRevision]=useState(0);const [deleting,setDeleting]=useState('');
  async function removeClient(c:Client){if(!window.confirm(`Удалить клиента «${c.name}»? Это действие нельзя отменить.`))return;setDeleting(c.id);setError('');try{await api('/clients/'+c.id,{method:'DELETE'});setPage(p=>clients.length===1?Math.max(1,p-1):p);setRevision(n=>n+1)}catch(e){setError(e instanceof Error?e.message:'Не удалось удалить')}finally{setDeleting('')}}
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(0);

  useEffect(()=>{if(!canRead)return;const c=new AbortController();setLoading(true);setError('');setClients([]);const timer=setTimeout(()=>{api<{items:Client[];total:number;totalPages:number}>(`/clients/paged?${new URLSearchParams({q:query,page:String(page),limit:'30'})}`,{signal:c.signal}).then(r=>{if(!c.signal.aborted){setClients(r.items);setTotal(r.total);setTotalPages(r.totalPages)}}).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setLoading(false)})},250);return()=>{clearTimeout(timer);c.abort()}},[canRead,query,page,revision]);

  function go(id: string) {
    router.push(`/clients/${id}`);
  }

  if (!canRead) return null;

  const visible=clients;
  return (
    <section className={`desk-panel ${styles.list} ${styles.clients}`}>
      <div className="desk-panel-body">
        <div className="field"><input aria-label="Поиск клиентов" placeholder="Имя или телефон" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div>
        <p className="muted">Найдено: {total}</p>
        {loading&&<p className="muted">Загрузка...</p>}
        {error ? <p className="error">{error}</p> : null}
        <div className={styles.mobileClients}>
          {visible.map(c => <article key={c.id} className={styles.clientCard}>
            <div className={styles.clientHeading}>
              <Link href={`/clients/${c.id}`} className={styles.clientName}>{c.name}</Link>
              <span className={styles.clientCount}>Заявок: <strong>{c._count.orders}</strong></span>
            </div>
            <div className={styles.clientActions}>
              <a href={phoneHref(c.phoneNormalized)} className={styles.clientPhone} aria-label={`Позвонить: ${c.name}`}>{formatRuPhoneDisplay(c.phoneNormalized)}</a>
              <Link href={`/clients/${c.id}#history`} className={styles.clientHistory} aria-label={`История заявок: ${c.name}`}>История <span aria-hidden="true">›</span></Link>
            </div>
            {user?.role==='OWNER'&&<button type="button" className="btn secondary" style={{justifySelf:'end',minHeight:36}} disabled={deleting===c.id} onClick={()=>void removeClient(c)}>Удалить</button>}
          </article>)}
          {!visible.length && !error && !loading && <p className={styles.orderEmpty}>Клиенты не найдены.</p>}
        </div>
        <div className={`table-scroll ${styles.desktopClients}`}>
          <table className="table desk-list">
            <thead>
              <tr>
                <th>Клиент</th>
                <th>Телефон</th>
                <th className="desk-col-center">Заявок</th>{user?.role==='OWNER'&&<th>Действия</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
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
                  <td className="desk-col-center" data-label="Заявок">
                    <span className="desk-count">{c._count.orders}</span>
                  </td>
                  {user?.role==='OWNER'&&<td><button type="button" className="btn secondary" disabled={deleting===c.id} onClick={e=>{e.stopPropagation();void removeClient(c)}} onKeyDown={e=>e.stopPropagation()}>Удалить</button></td>}
                </tr>
              ))}
              {visible.length === 0 && !error && !loading ? (
                <tr>
                  <td colSpan={3} className="muted desk-col-center">
                    Клиенты не найдены.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <nav className={styles.pagination} aria-label="Страницы клиентов"><button className="btn secondary" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Назад</button><span>Страница {page} из {Math.max(1,totalPages)}</span><button className="btn secondary" disabled={loading||page>=totalPages} onClick={()=>setPage(p=>p+1)}>Далее</button></nav>
      </div>
    </section>
  );
}
