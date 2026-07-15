'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecentOrders, getStoredUser, RecentOrder } from '@/lib/api';

const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'OWNER'];
const POLL_MS = 15000;
const LS_KEY = 'crm_orders_last_seen';

/**
 * Всплывающее уведомление о новых заявках для админов.
 * Опрашивает /orders/recent, проигрывает звук и показывает модалку,
 * которая закрывается только кнопкой «Прочитано» (сама не исчезает).
 */
export function NewOrderNotifier() {
  const [queue, setQueue] = useState<RecentOrder[]>([]);
  const lastSeenRef = useRef<string>('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !ADMIN_ROLES.includes(user.role)) return;

    lastSeenRef.current =
      localStorage.getItem(LS_KEY) || new Date().toISOString();
    localStorage.setItem(LS_KEY, lastSeenRef.current);

    // Разблокировка звука после первого действия пользователя.
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
        const items = await getRecentOrders(lastSeenRef.current);
        if (stopped || !items.length) return;
        const newest = items[items.length - 1].createdAt;
        lastSeenRef.current = newest;
        localStorage.setItem(LS_KEY, newest);
        setQueue((prev) => {
          const seen = new Set(prev.map((o) => o.id));
          const fresh = items.filter((o) => !seen.has(o.id));
          if (fresh.length) beep();
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        /* сетевые ошибки игнорируем — попробуем на следующем тике */
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

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => prev.filter((o) => o.id !== id));
  }, []);
  const dismissAll = useCallback(() => setQueue([]), []);

  if (!queue.length) return null;

  return (
    <div className="notify-overlay" role="dialog" aria-modal="true">
      <div className="notify-card">
        <h2 className="notify-title">🔔 Новые заявки ({queue.length})</h2>
        <div className="notify-list">
          {queue.map((o) => (
            <div key={o.id} className="notify-item">
              <div>
                <strong>{o.publicId}</strong>
                {o.cityName ? ` · ${o.cityName}` : ''}
                {!o.hasMaster ? (
                  <span className="notify-flag">без мастера</span>
                ) : null}
              </div>
              <div className="muted">
                {o.clientName} · {o.phone}
              </div>
              <div className="muted">{o.address}</div>
              <div className="notify-actions">
                <Link
                  className="btn"
                  href={`/orders/${o.id}`}
                  onClick={() => dismiss(o.id)}
                >
                  Открыть и назначить
                </Link>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => dismiss(o.id)}
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
