'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CHAT_CHANNEL_LABELS, CHAT_STATUS_LABELS } from '@/lib/labels';

type Thread = {
  id: string;
  title?: string | null;
  channel: string;
  status: string;
  linkedOrderId?: string | null;
  updatedAt: string;
  order?: {
    id: string;
    publicId: string;
    client?: { name: string; phoneNormalized?: string } | null;
  } | null;
  _count?: { messages: number };
};

type Message = {
  id: string;
  body: string;
  fromClient: boolean;
  createdAt: string;
  author?: { fullName: string } | null;
};

type ThreadDetail = Thread & { messages: Message[] };

type Master = { id: string; user: { fullName: string } };
type OrderOpt = {
  id: string;
  publicId: string;
  client?: { name: string } | null;
};

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [message, setMessage] = useState('');
  const [linkOrderId, setLinkOrderId] = useState('');
  const [masterId, setMasterId] = useState('');
  const [masters, setMasters] = useState<Master[]>([]);
  const [orders, setOrders] = useState<OrderOpt[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function loadThreads() {
    const list = await api<Thread[]>('/chat/threads');
    setThreads(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }

  async function loadThread(id: string) {
    setThread(await api<ThreadDetail>(`/chat/threads/${id}`));
  }

  useEffect(() => {
    loadThreads().catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
    Promise.all([
      api<Master[]>('/masters'),
      api<OrderOpt[]>('/orders'),
    ])
      .then(([m, o]) => {
        setMasters(m);
        setOrders(o);
        if (m[0]) setMasterId(m[0].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setMsg('');
    loadThread(selectedId).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  }, [selectedId]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !message.trim()) return;
    setError('');
    try {
      await api(`/chat/threads/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body: message.trim() }),
      });
      setMessage('');
      await loadThread(selectedId);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function linkOrder(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !linkOrderId.trim()) return;
    setError('');
    setMsg('');
    try {
      await api(`/chat/threads/${selectedId}/link-order`, {
        method: 'POST',
        body: JSON.stringify({ orderId: linkOrderId.trim() }),
      });
      setLinkOrderId('');
      await loadThread(selectedId);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function sendToMaster(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !masterId) return;
    setError('');
    setMsg('');
    try {
      await api(`/chat/threads/${selectedId}/send-to-master`, {
        method: 'POST',
        body: JSON.stringify({ masterId }),
      });
      setMsg('Заявка отправлена мастеру');
      await loadThread(selectedId);
      await loadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  return (
    <div>
      <h1 className="page-title">Чат</h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Диалоги</h2>
          {threads.length === 0 ? (
            <p className="muted">Диалогов пока нет.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {threads.map((t) => (
                <li key={t.id} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    className={selectedId === t.id ? 'btn' : 'btn secondary'}
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <div>{t.title ?? t.id.slice(0, 8)}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {CHAT_CHANNEL_LABELS[t.channel] ?? t.channel} ·{' '}
                      {CHAT_STATUS_LABELS[t.status] ?? t.status}
                      {t.order ? ` · ${t.order.publicId}` : ''}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          {!thread ? (
            <p className="muted">Выберите диалог</p>
          ) : (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
                {thread.title ?? 'Диалог'}{' '}
                <span className="badge">{CHAT_STATUS_LABELS[thread.status]}</span>
              </h2>

              {thread.order ? (
                <p style={{ marginTop: 0 }}>
                  Привязанная заявка:{' '}
                  <Link href={`/orders/${thread.order.id}`}>
                    {thread.order.publicId}
                  </Link>
                  {thread.order.client?.name
                    ? ` · ${thread.order.client.name}`
                    : ''}
                </p>
              ) : (
                <p className="muted" style={{ marginTop: 0 }}>
                  Заявка не привязана
                </p>
              )}

              <form onSubmit={linkOrder} style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                <select
                  value={linkOrderId}
                  onChange={(e) => setLinkOrderId(e.target.value)}
                  style={{ flex: 1 }}
                  required
                >
                  <option value="">Выберите заявку…</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.publicId}
                      {o.client?.name ? ` — ${o.client.name}` : ''}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn secondary">
                  Привязать
                </button>
              </form>

              <form
                onSubmit={sendToMaster}
                style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}
              >
                <select
                  value={masterId}
                  onChange={(e) => setMasterId(e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                  required
                >
                  <option value="">Мастер…</option>
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.user.fullName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn">
                  Отправить заявку мастеру
                </button>
              </form>

              <div
                style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                {thread.messages.length === 0 ? (
                  <p className="muted">Сообщений нет.</p>
                ) : (
                  thread.messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        marginBottom: 8,
                        textAlign: m.fromClient ? 'left' : 'right',
                      }}
                    >
                      <div
                        style={{
                          display: 'inline-block',
                          background: m.fromClient ? '#f3f4f6' : '#ecfeff',
                          padding: '6px 10px',
                          borderRadius: 8,
                          maxWidth: '85%',
                        }}
                      >
                        {m.body}
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {m.fromClient
                          ? 'Клиент'
                          : (m.author?.fullName ?? 'Оператор')}{' '}
                        · {new Date(m.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                <input
                  required
                  placeholder="Сообщение"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn">
                  Отправить
                </button>
              </form>
            </>
          )}
          {msg ? <p style={{ color: '#0f766e' }}>{msg}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
