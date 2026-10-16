import { useSyncExternalStore } from 'react';

// Routeur minimal : quelques routes et des paramètres d'URL, sans dépendance.
const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
};
const getHref = () => window.location.pathname + window.location.search;

export function navigate(path: string, replace = false) {
  if (path === getHref()) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  if (!replace) window.scrollTo(0, 0);
}

export function usePath() {
  useSyncExternalStore(subscribe, getHref);
  return window.location.pathname;
}

export function useQuery(): URLSearchParams {
  const href = useSyncExternalStore(subscribe, getHref);
  return new URLSearchParams(href.includes('?') ? href.slice(href.indexOf('?')) : '');
}

/** Modifie des paramètres d'URL sans changer de page (null = supprimer). */
export function setQuery(patch: Record<string, string | null>, replace = true) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  navigate(window.location.pathname + (s ? `?${s}` : ''), replace);
}
