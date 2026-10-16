import { useCallback, useEffect, useRef, useState } from 'react';
import { useRemoteChanges, useStore } from './store';

/**
 * Charge une ressource de l'équipe et la recharge à chaque changement reçu en
 * temps réel (regroupé), pour que statistiques et historiques restent à jour.
 */
export function useLiveResource<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const loadRef = useRef(load);
  loadRef.current = load;
  const store = useStore();

  const reload = useCallback(() => {
    loadRef.current().then(
      (d) => {
        setData(d);
        setError(false);
      },
      () => setError(true),
    );
  }, []);

  useEffect(reload, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(reload, 600);
  };
  useRemoteChanges(schedule);
  // Les changements faits depuis cet écran (forçage, séjour) modifient aussi les chiffres.
  const version = store.list();
  useEffect(schedule, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { data, error, reload };
}

/** « 7, 12, 18 et 21 » */
export function frenchList(items: (string | number)[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}
