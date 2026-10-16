import type { AppConfig, ButtonValue, ProgramSettings, Room, RoomDetail, RoomEvent, Source, Stats, User } from './types';

/** Erreur métier renvoyée par le serveur (4xx/5xx) : on annule l'optimisme. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Le serveur n'a pas pu être joint : l'intention reste en attente. */
export class NetworkError extends Error {}

// Même origine que la page : fonctionne sur localhost, sur l'IP du réseau
// local, derrière le proxy Vite et une fois déployé, sans configuration.
export const API_BASE = '';
export function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

/** Appelé quand le serveur répond 401 sur une route de l'équipe (session expirée). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
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
      credentials: 'same-origin',
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
      else if (Array.isArray(data?.detail)) msg = 'Valeur invalide : vérifiez les champs saisis.';
    } catch {
      /* corps non JSON */
    }
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    throw new HttpError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  // Public (écrans en chambre)
  config: () => request<AppConfig>('GET', '/api/config'),
  rooms: () => request<Room[]>('GET', '/api/rooms'),
  toggle: (n: number, to?: ButtonValue) => request<Room>('POST', `/api/rooms/${n}/toggle`, to ? { to } : undefined),
  // Session
  login: (email: string, password: string, remember: boolean) => request<User>('POST', '/api/auth/login', { email, password, remember }),
  logout: () => request<{ ok: boolean }>('POST', '/api/auth/logout'),
  me: () => request<User>('GET', '/api/auth/me'),
  changePassword: (current: string, next: string) => request<{ ok: boolean }>('POST', '/api/auth/password', { current, new: next }),
  // Équipe
  room: (n: number) => request<RoomDetail>('GET', `/api/rooms/${n}`),
  force: (n: number, state: ButtonValue) => request<Room>('PUT', `/api/rooms/${n}/state`, { state }),
  stay: (n: number, nights: number) => request<Room>('PUT', `/api/rooms/${n}/stay`, { nights }),
  endStay: (n: number) => request<Room>('DELETE', `/api/rooms/${n}/stay`),
  addRoom: (number: number, room_type: string) => request<Room>('POST', '/api/rooms', { number, room_type }),
  removeRoom: (n: number) => request<{ ok: boolean }>('DELETE', `/api/rooms/${n}`),
  voucher: (id: number, status: 'emis' | 'remis' | 'annule') => request<{ ok: boolean }>('PUT', `/api/vouchers/${id}`, { status }),
  events: (days: number, source?: Source) =>
    request<RoomEvent[]>('GET', `/api/events?days=${days}${source ? `&source=${source}` : ''}`),
  stats: (days: number) => request<Stats>('GET', `/api/stats?days=${days}`),
  settings: () => request<ProgramSettings>('GET', '/api/settings'),
  saveSettings: (patch: Partial<ProgramSettings>) => request<ProgramSettings>('PUT', '/api/settings', patch),
  users: () => request<User[]>('GET', '/api/users'),
  invite: (u: { email: string; name: string; title: string; role: User['role'] }) => request<User>('POST', '/api/users', u),
  patchUser: (id: number, patch: Partial<Pick<User, 'name' | 'title' | 'role'>> & { reset_password?: boolean }) =>
    request<User>('PATCH', `/api/users/${id}`, patch),
  deleteUser: (id: number) => request<{ ok: boolean }>('DELETE', `/api/users/${id}`),
};

/** Adresse publique de l'écran bouton d'une chambre (même origine que la page). */
export const roomUrl = (n: number) => `${location.origin}/chambre/${n}`;
export const qrSrc = (data: string) => `${API_BASE}/api/qr.svg?data=${encodeURIComponent(data)}`;

/** Téléchargement d'un export (le cookie de session accompagne la requête). */
export function download(path: string) {
  const a = document.createElement('a');
  a.href = API_BASE + path;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
