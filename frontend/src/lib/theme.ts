import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'gk.theme';
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let current: ThemePref = read();

/** Applique le thème : attribut data-theme, ou rien pour suivre le système. */
export function applyTheme(pref: ThemePref = current) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setTheme(pref: ThemePref) {
  current = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* stockage indisponible : le choix vaut pour cette page seulement */
  }
  applyTheme(pref);
  listeners.forEach((fn) => fn());
}

export function isDark(): boolean {
  if (current === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return current === 'dark';
}

export function useTheme(): ThemePref {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      mq?.addEventListener?.('change', fn);
      return () => {
        listeners.delete(fn);
        mq?.removeEventListener?.('change', fn);
      };
    },
    () => current,
  );
}
