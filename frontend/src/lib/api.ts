import type { AppConfig, ButtonValue, Room, RoomDetail } from './types';

/** Erreur métier renvoyée par le serveur (4xx/5xx) : on annule l'optimisme. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
/** Le serveur n'a pas pu être joint : l'intention reste en attente. */
export class NetworkError extends Error {}

// Même origine que la page : fonctionne sur localhost, sur l'IP du réseau
// local et derrière le proxy Vite, sans aucune configuration.
export const API_BASE = '';
export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch {
    throw new NetworkError('Serveur injoignable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `Erreur serveur (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') msg = data.detail;
    } catch {
      /* corps non JSON */
    }
    throw new HttpError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  rooms: () => request<Room[]>('GET', '/api/rooms'),
  room: (n: number) => request<RoomDetail>('GET', `/api/rooms/${n}`),
  toggle: (n: number, to?: ButtonValue) => request<Room>('POST', `/api/rooms/${n}/toggle`, to ? { to } : undefined),
  force: (n: number, state: ButtonValue) => request<Room>('PUT', `/api/rooms/${n}/state`, { state }),
  stay: (n: number, nights: number) => request<Room>('PUT', `/api/rooms/${n}/stay`, { nights }),
  endStay: (n: number) => request<Room>('DELETE', `/api/rooms/${n}/stay`),
  config: () => request<AppConfig>('GET', '/api/config'),
  reset: () => request<Room[]>('POST', '/api/demo/reset'),
};

/** Adresse publique de l'écran bouton d'une chambre (même origine que la page). */
export const roomUrl = (n: number) => `${location.origin}/chambre/${n}`;
export const qrSrc = (data: string) => `${API_BASE}/api/qr.svg?data=${encodeURIComponent(data)}`;
