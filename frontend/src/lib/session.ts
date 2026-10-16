import { useSyncExternalStore } from 'react';
import { api, setUnauthorizedHandler } from './api';
import type { User } from './types';

/**
 * Session de l'équipe. `user` vaut undefined pendant la vérification initiale,
 * null si personne n'est connecté.
 */
class SessionStore {
  user: User | null | undefined = undefined;
  private version = 0;
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;

  constructor() {
    setUnauthorizedHandler(() => this.set(null));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private set(user: User | null) {
    this.user = user;
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  load = () => {
    if (!this.loading) {
      this.loading = api.me().then(
        (u) => this.set(u),
        () => this.set(null),
      );
    }
    return this.loading;
  };

  login = async (email: string, password: string, remember: boolean) => {
    const user = await api.login(email, password, remember);
    this.set(user);
    return user;
  };

  logout = async () => {
    try {
      await api.logout();
    } finally {
      this.loading = null;
      this.set(null);
    }
  };
}

export const session = new SessionStore();

export function useSession() {
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session;
}
