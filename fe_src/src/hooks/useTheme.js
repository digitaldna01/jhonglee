import { useCallback, useSyncExternalStore } from 'react';

/* Theme lives on <html data-theme="light|dark">, persisted as `pf-theme`.
   index.html applies it before first paint; this hook reads and toggles it.
   Without a stored choice the theme follows the OS setting, live — the
   header toggle stores an explicit choice and ends the following. */

const STORAGE_KEY = 'pf-theme';
const listeners = new Set();

function storedChoice() {
  try { const t = localStorage.getItem(STORAGE_KEY); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
}

// while the visitor hasn't chosen, track OS theme changes as they happen
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (storedChoice()) return;
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    listeners.forEach((l) => l());
  });
}

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
