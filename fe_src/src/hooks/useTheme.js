import { useCallback, useSyncExternalStore } from 'react';

/* Theme lives on <html data-theme="light|dark">, persisted as `pf-theme`.
   index.html applies the stored value before first paint; this hook only
   reads and toggles it. Default is light — prefers-color-scheme is not
   consulted (the design ships light-first). */

const STORAGE_KEY = 'pf-theme';
const listeners = new Set();

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTheme(next) {
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export default function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light');
  const toggle = useCallback(() => setTheme(readTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
