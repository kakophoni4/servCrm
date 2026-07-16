export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'crm_theme';

export function getStoredThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Применить тему к <html data-theme="…">. */
export function applyTheme(pref: ThemePref) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePref = pref;
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}
