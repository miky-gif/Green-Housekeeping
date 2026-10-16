import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { ProgramSettings } from './types';

/** Réglages du programme, partagés par tous les écrans de l'équipe. */
let current: ProgramSettings | null = null;
let version = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((fn) => fn());
}

export function loadProgram(force = false) {
  if (!loading || force) {
    loading = api.settings().then(
      (s) => {
        current = s;
        emit();
      },
      () => {
        loading = null;
      },
    );
  }
  return loading;
}

export function setProgram(s: ProgramSettings) {
  current = s;
  emit();
}

export function useProgram(): ProgramSettings | null {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => version,
  );
  useEffect(() => {
    void loadProgram();
  }, []);
  return current;
}

/** « The Iris » depuis « The Iris · bar et restaurant, 24e étage ». */
export const barName = (p: ProgramSettings | null) => (p?.drink_place.split('·')[0].trim() || 'le bar');

/** « Iris » pour écrire « offerte au Iris » (sans l'article anglais). */
export const barShort = (p: ProgramSettings | null) => barName(p).replace(/^the\s+/i, '');
