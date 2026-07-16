'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRecentOrders,
  getStoredUser,
  getUrgentUnassignedOrders,
  RecentOrder,
} from '@/lib/api';
import { formatRuPhoneDisplay } from '@/lib/phone';

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

function formatSchedule(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Уведомления для админов (панель справа снизу, не блокирует CRM):
 * — новые заявки;
 * — без мастера и до визита ≤30 мин.
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
              byId.set(item.id, { ...byId.get(item.id)!, ...item });
            }
          }
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
  const title =
    urgentCount && newCount
      ? `Уведомления · ${queue.length}`
      : urgentCount
        ? `Срочно · ${urgentCount}`
        : `Новые · ${newCount}`;

  return (
    <div className="notify-dock" aria-live="polite" aria-label={title}>
      <div
        className={
          urgentCount
            ? 'notify-dock-card notify-dock-card-urgent'
            : 'notify-dock-card'
        }
      >
        <div className="notify-dock-head">
          <h2 className="notify-dock-title">{title}</h2>
          <button
            type="button"
            className="btn-link notify-dock-dismiss-all"
            onClick={dismissAll}
          >
            Скрыть всё
          </button>
        </div>

        <div className="notify-dock-list">
          {queue.map((o) => {
            const when = formatSchedule(o.scheduledAt);
            return (
              <div
                key={o.id}
                className={
                  o.kind === 'urgent'
                    ? 'notify-dock-item notify-dock-item-urgent'
                    : 'notify-dock-item'
                }
              >
                <div className="notify-dock-item-top">
                  <strong className="notify-dock-id">{o.publicId}</strong>
                  {o.kind === 'urgent' ? (
                    <span className="urgent-pill">срочно</span>
                  ) : null}
                </div>
                <div className="notify-dock-meta">
                  {o.cityName ? <span>{o.cityName}</span> : null}
                  {when ? <span>{when}</span> : null}
                </div>
                <div className="notify-dock-client">
                  {o.clientName}
                  {o.phone ? (
                    <span className="muted">
                      {' · '}
                      {formatRuPhoneDisplay(o.phone)}
                    </span>
                  ) : null}
                </div>
                <div className="notify-dock-actions">
                  <Link
                    className="btn"
                    href={`/orders/${o.id}`}
                    onClick={() => dismiss(o)}
                  >
                    Открыть
                  </Link>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => dismiss(o)}
                  >
                    Скрыть
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
