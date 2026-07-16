'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { hasPermission } from '@/lib/permissions';

const POLL_MS = 4000;
const ADMIN_ROLES = ['ADMIN', 'DIRECTOR', 'OWNER'];

type ThreadPreview = {
  id: string;
  title?: string | null;
  messages?: Array<{
    body: string;
    createdAt: string;
    fromClient: boolean;
  }>;
};

type ChatNotify = {
  id: string;
  threadId: string;
  masterName: string;
  body: string;
  createdAt: string;
};

function truncate(text: string, max = 140) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Уведомления о новых сообщениях мастеров в чате
 * (панель справа снизу + звук, как у новых заявок).
 */
export function ChatMessageNotifier() {
  const [queue, setQueue] = useState<ChatNotify[]>([]);
  const lastSeenRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;
    if (
      !ADMIN_ROLES.includes(user.role) &&
      !hasPermission(user.role, user.permissions, 'chat.read')
    ) {
      return;
    }

    const unlock = () => {
      if (!audioCtxRef.current) {
        try {
          const Ctx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext;
          audioCtxRef.current = new Ctx();
        } catch {
          /* ignore */
        }
      }
      void audioCtxRef.current?.resume().catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    /** Два коротких «двойных» тона — не путать с тремя высокими бипами заявки. */
    const beep = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const now = ctx.currentTime;
      const tones = [523.25, 659.25]; // C5 → E5
      tones.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.28, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      });
    };

    let stopped = false;

    const poll = async () => {
      try {
        const threads = await api<ThreadPreview[]>('/chat/threads');
        if (stopped) return;

        if (!seededRef.current) {
          for (const t of threads) {
            const last = t.messages?.[0];
            if (last) lastSeenRef.current.set(t.id, last.createdAt);
          }
          seededRef.current = true;
          return;
        }

        const fresh: ChatNotify[] = [];
        for (const t of threads) {
          const last = t.messages?.[0];
          if (!last?.fromClient) continue;
          const prev = lastSeenRef.current.get(t.id);
          if (prev && last.createdAt <= prev) continue;
          lastSeenRef.current.set(t.id, last.createdAt);
          // Первый раз увидели тред без prev — не спамим
          if (!prev) continue;
          fresh.push({
            id: `${t.id}:${last.createdAt}`,
            threadId: t.id,
            masterName: t.title?.trim() || 'Мастер',
            body: last.body,
            createdAt: last.createdAt,
          });
        }

        if (!fresh.length) return;

        setQueue((q) => {
          const ids = new Set(q.map((x) => x.id));
          const add = fresh.filter((x) => !ids.has(x.id));
          if (!add.length) return q;
          beep();
          return [...add, ...q].slice(0, 12);
        });
      } catch {
        /* ignore */
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
    setQueue((q) => q.filter((x) => x.id !== id));
  }, []);

  const dismissAll = useCallback(() => setQueue([]), []);

  if (!queue.length) return null;

  return (
    <div
      className="notify-dock notify-dock-chat"
      aria-live="polite"
      aria-label="Новые сообщения в чате"
    >
      <div className="notify-dock-card">
        <div className="notify-dock-head">
          <h2 className="notify-dock-title">
            Чат · {queue.length}
          </h2>
          <button
            type="button"
            className="btn-link notify-dock-dismiss-all"
            onClick={dismissAll}
          >
            Скрыть всё
          </button>
        </div>
        <div className="notify-dock-list">
          {queue.map((m) => (
            <div key={m.id} className="notify-dock-item notify-dock-item-chat">
              <div className="notify-dock-item-top">
                <strong className="notify-dock-id">{m.masterName}</strong>
              </div>
              <div className="notify-dock-chat-body">{truncate(m.body)}</div>
              <div className="notify-dock-actions">
                <Link
                  className="btn"
                  href={`/chat?thread=${encodeURIComponent(m.threadId)}`}
                  onClick={() => dismiss(m.id)}
                >
                  Открыть
                </Link>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => dismiss(m.id)}
                >
                  Скрыть
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
