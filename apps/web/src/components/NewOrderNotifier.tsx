'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRecentOrders,
  getStoredUser,
  getUrgentUnassignedOrders,
  RecentOrder,
} from '@/lib/api';

const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'OWNER'];
const POLL_MS = 15000;
const LS_KEY = 'crm_orders_last_seen';
const LS_URGENT_DISMISSED = 'crm_urgent_dismissed';

type NotifyItem = RecentOrder & { kind: 'new' | 'urgent' };

function readDismissedUrgent(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_URGENT_DISMISSED);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDismissedUrgent(ids: Set<string>) {
  localStorage.setItem(LS_URGENT_DISMISSED, JSON.stringify([...ids]));
}

/**
 * Всплывающие уведомления для админов:
 * — новые заявки (/orders/recent);
 * — без мастера и до визита ≤30 мин (/orders/urgent-unassigned).
 */
export function NewOrderNotifier() {
  const [queue, setQueue] = useState<NotifyItem[]>([]);
  const lastSeenRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const dismissedUrgentRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) return;

    lastSeenRef.current =
      localStorage.getItem(LS_KEY) || new Date().toISOString();
    localStorage.setItem(LS_KEY, lastSeenRef.current);
    dismissedUrgentRef.current = readDismissedUrgent();

    const unlock = () => {
      if (!audioCtxRef.current) {
        try {
          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioCtxRef.current = new Ctx();
        } catch {
          /* нет Web Audio — попап всё равно работает */
        }
      }
      void audioCtxRef.current?.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    const beep = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        const t = now + i * 0.28;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.24);
      }
    };

    let stopped = false;

    const poll = async () => {
      try {
        const [recent, urgent] = await Promise.all([
          getRecentOrders(lastSeenRef.current),
          getUrgentUnassignedOrders(),
        ]);
        if (stopped) return;

        if (recent.length) {
          const newest = recent[recent.length - 1].createdAt;
          lastSeenRef.current = newest;
          localStorage.setItem(LS_KEY, newest);
        }

        const activeUrgentIds = new Set(urgent.map((o) => o.id));
        // Сброс «прочитано» для заявок, которые уже не срочные / назначили мастера
        let dismissedChanged = false;
        for (const id of [...dismissedUrgentRef.current]) {
          if (!activeUrgentIds.has(id)) {
            dismissedUrgentRef.current.delete(id);
            dismissedChanged = true;
          }
        }
        if (dismissedChanged) {
          writeDismissedUrgent(dismissedUrgentRef.current);
        }

        const freshUrgent = urgent
          .filter((o) => !dismissedUrgentRef.current.has(o.id))
          .map((o) => ({ ...o, kind: 'urgent' as const }));
        const freshNew = recent.map((o) => ({
          ...o,
          kind: 'new' as const,
        }));

        setQueue((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          let added = 0;
          for (const item of [...freshNew, ...freshUrgent]) {
            if (!byId.has(item.id)) {
              byId.set(item.id, item);
              added += 1;
            } else if (item.kind === 'urgent') {
              // подтянуть kind/время, если заявка уже в очереди как новая
              byId.set(item.id, { ...byId.get(item.id)!, ...item });
            }
          }
          // убрать из очереди urgent, которых больше нет в ответе API
          for (const [id, item] of byId) {
            if (item.kind === 'urgent' && !activeUrgentIds.has(id)) {
              byId.delete(id);
            }
          }
          if (added) beep();
          return [...byId.values()];
        });
      } catch {
        /* сетевые ошибки игнорируем */
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const dismiss = useCallback((item: NotifyItem) => {
    if (item.kind === 'urgent') {
      dismissedUrgentRef.current.add(item.id);
      writeDismissedUrgent(dismissedUrgentRef.current);
    }
    setQueue((prev) => prev.filter((o) => o.id !== item.id));
  }, []);

  const dismissAll = useCallback(() => {
    setQueue((prev) => {
      for (const o of prev) {
        if (o.kind === 'urgent') dismissedUrgentRef.current.add(o.id);
      }
      writeDismissedUrgent(dismissedUrgentRef.current);
      return [];
    });
  }, []);

  if (!queue.length) return null;

  const urgentCount = queue.filter((o) => o.kind === 'urgent').length;
  const newCount = queue.length - urgentCount;

  return (
    <div className="notify-overlay" role="dialog" aria-modal="true">
      <div
        className={
          urgentCount ? 'notify-card notify-card-urgent' : 'notify-card'
        }
      >
        <h2 className="notify-title">
          {urgentCount && newCount
            ? `Уведомления (${queue.length})`
            : urgentCount
              ? `Срочно: без мастера (${urgentCount})`
              : `Новые заявки (${newCount})`}
        </h2>
        <div className="notify-list">
          {queue.map((o) => (
            <div
              key={o.id}
              className={
                o.kind === 'urgent' ? 'notify-item notify-item-urgent' : 'notify-item'
              }
            >
              <div>
                <strong>{o.publicId}</strong>
                {o.cityName ? ` · ${o.cityName}` : ''}
                {o.kind === 'urgent' ? (
                  <span className="notify-flag">≤30 мин, без мастера</span>
                ) : !o.hasMaster ? (
                  <span className="notify-flag">без мастера</span>
                ) : null}
              </div>
              <div className="muted">
                {o.clientName} · {o.phone}
              </div>
              <div className="muted">{o.address}</div>
              {o.scheduledAt ? (
                <div className="muted">
                  Время:{' '}
                  {new Date(o.scheduledAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              ) : null}
              <div className="notify-actions">
                <Link
                  className="btn"
                  href={`/orders/${o.id}`}
                  onClick={() => dismiss(o)}
                >
                  Открыть и назначить
                </Link>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => dismiss(o)}
                >
                  Прочитано
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          className="btn"
          type="button"
          onClick={dismissAll}
          style={{ marginTop: 12, width: '100%' }}
        >
          Прочитано всё
        </button>
      </div>
    </div>
  );
}
