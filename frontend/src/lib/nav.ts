import { useSyncExternalStore } from 'react';

// Routeur minimal : quatre routes, aucune dépendance de plus à faire échouer.
const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
};
const getPath = () => window.location.pathname;

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export function usePath() {
  return useSyncExternalStore(subscribe, getPath);
}
