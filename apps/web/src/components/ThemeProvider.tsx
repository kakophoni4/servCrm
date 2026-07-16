'use client';

import { useEffect } from 'react';
import { applyTheme, getStoredThemePref } from '@/lib/theme';

/** Синхронизирует тему из localStorage и системных настроек. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const pref = getStoredThemePref();
    applyTheme(pref);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange() {
      if (getStoredThemePref() === 'system') applyTheme('system');
    }
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, []);

  return <>{children}</>;
}
