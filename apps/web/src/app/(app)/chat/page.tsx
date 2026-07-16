'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/labels';

type MessagePreview = {
  body: string;
  createdAt: string;
  fromClient: boolean;
};

type Message = {
  id: string;
  body: string;
  fromClient: boolean;
  createdAt: string;
  author?: { fullName: string } | null;
};

type Thread = {
  id: string;
  title?: string | null;
  channel: string;
  status: string;
  externalId?: string | null;
  updatedAt: string;
  messages?: MessagePreview[];
};

type ThreadDetail = Omit<Thread, 'messages'> & { messages: Message[] };

type UnassignedOrder = {
  id: string;
  publicId: string;
  address: string;
  comment?: string | null;
  adminComment?: string | null;
  scheduledAt?: string | null;
  status: string;
  typeTech?: string | null;
  client: { name: string; phoneNormalized: string };
  city?: { id: string; name: string; cityName?: string | null } | null;
};

const POLL_MS = 3000;

export default function ChatPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [orders, setOrders] = useState<UnassignedOrder[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadThreads = useCallback(async () => {
    const list = await api<Thread[]>('/chat/threads');
    setThreads(list);
  }, []);

  const loadOrders = useCallback(async () => {
    const list = await api<UnassignedOrder[]>('/chat/unassigned-orders');
    setOrders(list);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const detail = await api<ThreadDetail>(`/chat/threads/${id}`);
    setThread(detail);
  }, []);

  const refreshAll = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      await Promise.all([loadThreads(), loadOrders()]);
      const id = selectedIdRef.current;
      if (id) await loadThread(id);
    } catch (e) {
      /* silent poll errors */
      if (e instanceof Error && !selectedIdRef.current) {
        setError(e.message);
      }
    }
  }, [loadThreads, loadOrders, loadThread]);

  useEffect(() => {
    refreshAll().catch((e) =>
      setError(e instanceof Error ? e.message : 'Ошибка'),
    );
    const t = setInterval(() => {
      void refreshAll();
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refreshAll]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread?.messages?.length, selectedId]);

  function openThread(id: string) {
    setSelectedId(id);
    setMobileView('thread');
    setError('');
    loadThread(id).catch((e) =>
      setError(e instanceof Error ? e.message : 'Ошибка'),
    );
  }

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

  async function assignOrder(orderId: string) {
    if (!selectedId) {
      setError('Сначала выберите чат мастера слева');
      return;
    }
    setError('');
    setAssigningId(orderId);
    try {
      await api(`/chat/threads/${selectedId}/assign-order`, {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      await Promise.all([loadOrders(), loadThreads(), loadThread(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setAssigningId(null);
    }
  }

  const layoutClass =
    mobileView === 'thread'
      ? 'chat-workspace chat-show-thread'
      : 'chat-workspace chat-show-list';

  const preview = (t: Thread) => {
    const last = t.messages?.[0];
    if (!last) return 'Нет сообщений';
    const prefix = last.fromClient ? '' : 'Вы: ';
    const body =
      last.body.length > 48 ? `${last.body.slice(0, 45)}…` : last.body;
    return `${prefix}${body}`;
  };

  return (
    <div className="chat-page">
      <h1 className="page-title">Чаты с мастерами</h1>
      {error ? <p className="error">{error}</p> : null}

      <div className={layoutClass}>
        <aside className="panel chat-list-panel">
          <h2 className="chat-panel-title">Мастера</h2>
          {threads.length === 0 ? (
            <p className="muted">
              Нет мастеров с Telegram ID. Укажите ID в карточке сотрудника.
            </p>
          ) : (
            <ul className="chat-thread-list">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={
                      selectedId === t.id
                        ? 'chat-thread-item active'
                        : 'chat-thread-item'
                    }
                    onClick={() => openThread(t.id)}
                  >
                    <div className="chat-thread-name">
                      {t.title ?? t.externalId ?? 'Мастер'}
                    </div>
                    <div className="chat-thread-preview muted">{preview(t)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="panel chat-thread-panel">
          {!thread ? (
            <p className="muted chat-empty">Выберите мастера слева</p>
          ) : (
            <>
              <button
                type="button"
                className="btn secondary chat-back"
                onClick={() => setMobileView('list')}
              >
                ← К списку
              </button>
              <h2 className="chat-panel-title">
                {thread.title ?? 'Мастер'}
              </h2>

              <div className="chat-messages" ref={messagesRef}>
                {thread.messages.length === 0 ? (
                  <p className="muted">Переписки пока нет — напишите мастеру.</p>
                ) : (
                  thread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        m.fromClient
                          ? 'chat-bubble chat-bubble-in'
                          : 'chat-bubble chat-bubble-out'
                      }
                    >
                      <div className="chat-bubble-body">{m.body}</div>
                      <div className="chat-bubble-meta muted">
                        {m.fromClient
                          ? 'Мастер'
                          : (m.author?.fullName ?? 'Офис')}{' '}
                        · {new Date(m.createdAt).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={sendMessage} className="chat-compose">
                <input
                  required
                  placeholder="Сообщение мастеру…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button type="submit" className="btn">
                  Отправить
                </button>
              </form>
            </>
          )}
        </section>

        <aside className="panel chat-orders-panel">
          <h2 className="chat-panel-title">
            Свободные заявки
            <span className="chat-orders-count">{orders.length}</span>
          </h2>
          {!selectedId ? (
            <p className="muted">
              Выберите мастера — затем отправьте ему заявку из списка.
            </p>
          ) : null}
          {orders.length === 0 ? (
            <p className="muted">Свободных заявок нет.</p>
          ) : (
            <ul className="chat-order-list">
              {orders.map((o) => (
                <li key={o.id} className="chat-order-card">
                  <div className="chat-order-head">
                    <Link href={`/orders/${o.id}`} className="chat-order-id">
                      {o.publicId}
                    </Link>
                    <span className="badge">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  <div className="chat-order-line">
                    <strong>{o.client.name}</strong>
                  </div>
                  <div className="chat-order-line muted">{o.address}</div>
                  {o.scheduledAt ? (
                    <div className="chat-order-line muted">
                      Визит:{' '}
                      {new Date(o.scheduledAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  ) : null}
                  {o.comment?.trim() ? (
                    <div className="chat-order-comment">{o.comment.trim()}</div>
                  ) : null}
                  <button
                    type="button"
                    className="btn chat-order-send"
                    disabled={!selectedId || assigningId === o.id}
                    onClick={() => void assignOrder(o.id)}
                  >
                    {assigningId === o.id
                      ? 'Отправка…'
                      : 'Отправить мастеру'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
