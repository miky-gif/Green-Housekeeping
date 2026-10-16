/**
 * Synchronisation temps réel.
 *
 * - Le serveur est l'unique source de vérité : `rooms` ne contient que ce
 *   qu'il a renvoyé (snapshot WebSocket, diffusion ou réponse HTTP).
 * - Un geste local crée une « intention » affichée immédiatement (optimiste),
 *   puis envoyée. Une seule requête en vol par chambre ; les appuis rapides
 *   sont fusionnés. Refus serveur → l'intention est annulée (retour arrière)
 *   et on resynchronise. Réseau coupé → l'intention attend la reconnexion.
 * - WebSocket : reconnexion avec backoff exponentiel + gigue, heartbeat
 *   applicatif pour détecter les connexions mortes (téléphone en veille,
 *   Wi-Fi qui décroche), snapshot complet à chaque (re)connexion.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api, HttpError, wsUrl } from './api';
import type { AppConfig, ButtonValue, Conn, Room } from './types';

type Kind = 'toggle' | 'force';
interface Intent {
  state: ButtonValue;
  kind: Kind;
  since: number;
}

export interface RemoteChange {
  room: Room;
  prev: Room;
  stayChanged: boolean;
}
export interface StoreError {
  room: number | null;
  message: string;
}

/** En dessous de ce délai, l'indicateur « Synchronisation… » ne s'affiche pas. */
export const SYNC_HINT_MS = 250;
const PING_EVERY_MS = 4000;
const DEAD_AFTER_MS = 10000;
const CONNECT_TIMEOUT_MS = 5000;
const BACKOFF_MAX_MS = 5000;

function changed(a: Room, b: Room) {
  return a.rev !== b.rev || a.stay?.id !== b.stay?.id || a.stay?.nights !== b.stay?.nights;
}

class SyncStore {
  conn: Conn = 'connecting';
  /** Configuration serveur (mode démo / production, nom de l'hôtel). */
  config: AppConfig | null = null;
  /** Au moins un état serveur reçu (snapshot WS ou GET initial). */
  ready = false;
  lastSyncAt: number | null = null;

  private rooms = new Map<number, Room>();
  private intents = new Map<number, Intent>();
  private inflight = new Set<number>();
  private retryTimers = new Map<number, number>();
  private epoch = 0; // incrémenté à chaque réinitialisation de démo
  private version = 0;
  private listCache: { v: number; list: Room[] } | null = null;

  private listeners = new Set<() => void>();
  private remoteListeners = new Set<(c: RemoteChange) => void>();
  private errorListeners = new Set<(e: StoreError) => void>();

  private ws: WebSocket | null = null;
  private attempt = 0;
  private lastMsgAt = 0;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private connectTimer: number | undefined;
  private resyncTimer: number | undefined;
  private started = false;

  // ------------------------------------------------------------ abonnement
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  onRemoteChange(fn: (c: RemoteChange) => void) {
    this.remoteListeners.add(fn);
    return () => void this.remoteListeners.delete(fn);
  }
  onError(fn: (e: StoreError) => void) {
    this.errorListeners.add(fn);
    return () => void this.errorListeners.delete(fn);
  }
  private notify() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  private emitError(room: number | null, message: string) {
    this.errorListeners.forEach((fn) => fn({ room, message }));
  }

  // --------------------------------------------------------------- lecture
  /** Vue d'une chambre : état serveur + intention locale éventuelle. */
  room(n: number): Room | undefined {
    const r = this.rooms.get(n);
    const it = this.intents.get(n);
    if (!r || !it) return r;
    return {
      ...r,
      state: it.state,
      updated_by: it.kind === 'toggle' ? 'guest' : 'staff',
      actor: it.kind === 'toggle' ? 'client' : 'gouvernante',
      updated_at: new Date(it.since).toISOString(),
    };
  }
  list(): Room[] {
    if (this.listCache?.v !== this.version) {
      const list = [...this.rooms.keys()].sort((a, b) => a - b).map((n) => this.room(n)!);
      this.listCache = { v: this.version, list };
    }
    return this.listCache.list;
  }
  /** Intention en attente depuis plus de SYNC_HINT_MS (sinon, rien à montrer). */
  syncingTarget(n: number): ButtonValue | null {
    const it = this.intents.get(n);
    return it && Date.now() - it.since >= SYNC_HINT_MS ? it.state : null;
  }
  hasPending(n: number) {
    return this.intents.has(n);
  }

  // -------------------------------------------------------------- gestes
  /** Appui client. Optimiste sauf si le séjour n'est pas éligible : là, le serveur tranche (règle 1). */
  toggle(n: number) {
    const cur = this.room(n);
    if (!cur) return;
    if (!cur.eligible || !cur.stay) {
      api.toggle(n).then(
        (room) => this.applyServer(room, false),
        (e) => this.emitError(n, e instanceof HttpError ? e.message : 'Serveur injoignable, réessayez.'),
      );
      return;
    }
    this.setIntent(n, cur.state === 'on' ? 'off' : 'on', 'toggle');
  }

  /** Forçage gouvernante (règle 3 : aucune contrainte d'éligibilité). */
  force(n: number, state?: ButtonValue) {
    const cur = this.room(n);
    if (!cur) return;
    const target = state ?? (cur.state === 'on' ? 'off' : 'on');
    if (target === cur.state) return;
    this.setIntent(n, target, 'force');
  }

  async setStay(n: number, nights: number) {
    try {
      this.applyServer(await api.stay(n, nights), false);
    } catch (e) {
      this.emitError(n, e instanceof HttpError ? e.message : 'Serveur injoignable.');
    }
  }

  /** Départ du client : la chambre est libérée. */
  async endStay(n: number) {
    try {
      this.applyServer(await api.endStay(n), false);
    } catch (e) {
      this.emitError(n, e instanceof HttpError ? e.message : 'Serveur injoignable.');
    }
  }

  private setIntent(n: number, state: ButtonValue, kind: Kind) {
    this.intents.set(n, { state, kind, since: Date.now() });
    this.notify();
    window.setTimeout(() => this.notify(), SYNC_HINT_MS + 20);
    void this.flush(n);
  }

  private async flush(n: number): Promise<void> {
    if (this.inflight.has(n)) return;
    const it = this.intents.get(n);
    if (!it) return;
    const srv = this.rooms.get(n);
    if (srv && srv.state === it.state) {
      this.intents.delete(n);
      this.notify();
      return;
    }
    this.inflight.add(n);
    const epoch = this.epoch;
    try {
      const room = it.kind === 'toggle' ? await api.toggle(n, it.state) : await api.force(n, it.state);
      if (epoch === this.epoch) this.applyServer(room, false);
    } catch (e) {
      this.inflight.delete(n);
      if (e instanceof HttpError) {
        // Refus serveur : retour arrière sur la vérité serveur, puis resync.
        this.intents.delete(n);
        this.emitError(n, e.message);
        this.resync();
      } else {
        // Réseau : l'intention est conservée et sera rejouée (idempotente).
        this.scheduleRetry(n);
        this.probe();
      }
      this.notify();
      return;
    }
    this.inflight.delete(n);
    if (this.intents.get(n) === it) this.intents.delete(n);
    this.notify();
    if (this.intents.has(n)) void this.flush(n); // nouvel appui pendant l'envoi
  }

  private scheduleRetry(n: number) {
    if (this.retryTimers.has(n)) return;
    const delay = this.conn === 'live' ? 1000 : 2500;
    this.retryTimers.set(
      n,
      window.setTimeout(() => {
        this.retryTimers.delete(n);
        void this.flush(n);
      }, delay),
    );
  }

  private flushAll() {
    for (const n of [...this.intents.keys()]) void this.flush(n);
  }

  // ------------------------------------------------------ état serveur
  private applyServer(room: Room, remote: boolean) {
    const prev = this.rooms.get(room.number);
    if (prev && room.rev < prev.rev) return; // réponse plus ancienne que l'état connu
    this.rooms.set(room.number, room);
    this.lastSyncAt = Date.now();
    if (remote && prev && changed(prev, room) && !this.intents.has(room.number) && !this.inflight.has(room.number)) {
      const stayChanged = prev.stay?.id !== room.stay?.id || prev.stay?.nights !== room.stay?.nights;
      this.remoteListeners.forEach((fn) => fn({ room, prev, stayChanged }));
    }
    this.notify();
  }

  private replaceAll(list: Room[], reason: string) {
    if (reason === 'reset') {
      this.epoch++;
      this.intents.clear();
    } else if (this.ready) {
      // Changements survenus pendant une coupure : on les signale aussi.
      for (const room of list) {
        const prev = this.rooms.get(room.number);
        if (prev && changed(prev, room) && !this.intents.has(room.number) && !this.inflight.has(room.number)) {
          const stayChanged = prev.stay?.id !== room.stay?.id || prev.stay?.nights !== room.stay?.nights;
          this.remoteListeners.forEach((fn) => fn({ room, prev, stayChanged }));
        }
      }
    }
    this.rooms = new Map(list.map((r) => [r.number, r]));
    this.ready = true;
    this.lastSyncAt = Date.now();
    this.notify();
  }

  /** Au moindre doute : snapshot complet. */
  resync() {
    window.clearTimeout(this.resyncTimer);
    this.resyncTimer = window.setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'resync' }));
      } else {
        api.rooms().then((list) => this.replaceAll(list, 'resync'), () => undefined);
      }
    }, 150);
  }

  // ------------------------------------------------------------ WebSocket
  start() {
    if (this.started) return;
    this.started = true;
    this.loadConfig();
    // Premier affichage sans attendre le WebSocket.
    api.rooms().then(
      (list) => {
        if (!this.ready) this.replaceAll(list, 'initial');
      },
      () => undefined,
    );
    this.connect();
    const wake = () => {
      if (document.visibilityState === 'visible') this.wake();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', () => this.wake());
    window.addEventListener('offline', () => this.ws && this.drop(this.ws));
  }

  /** Relit la configuration publique (après un changement de réglages). */
  refreshConfig() {
    this.loadConfig(0);
  }

  private loadConfig(attempt = 0) {
    api.config().then(
      (cfg) => {
        this.config = cfg;
        this.notify();
      },
      () => window.setTimeout(() => this.loadConfig(attempt + 1), Math.min(5000, 500 * 2 ** attempt)),
    );
  }

  private connect() {
    window.clearTimeout(this.reconnectTimer);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.connectTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) this.drop(ws);
    }, CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      window.clearTimeout(this.connectTimer);
      this.lastMsgAt = Date.now();
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.heartbeat(ws), PING_EVERY_MS);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastMsgAt = Date.now();
      this.onMessage(String(ev.data));
    };
    ws.onclose = () => this.drop(ws);
    ws.onerror = () => this.drop(ws);
  }

  private onMessage(raw: string) {
    let msg: { type: string; room?: Room; rooms?: Room[]; reason?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'snapshot' && msg.rooms) {
      this.replaceAll(msg.rooms, msg.reason ?? 'connect');
      if (this.conn !== 'live') {
        this.conn = 'live';
        this.attempt = 0;
        this.notify();
      }
      this.flushAll(); // intentions mises en attente pendant la coupure
    } else if (msg.type === 'state' && msg.room) {
      this.applyServer(msg.room, true);
    }
  }

  private heartbeat(ws: WebSocket) {
    if (this.ws !== ws) return;
    if (Date.now() - this.lastMsgAt > DEAD_AFTER_MS) {
      this.drop(ws);
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    } catch {
      this.drop(ws);
    }
  }

  /** Vérification rapide : sans réponse sous 2,5 s, la connexion est déclarée morte. */
  private probe() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const sentAt = Date.now();
    try {
      ws.send(JSON.stringify({ type: 'ping', t: sentAt }));
    } catch {
      this.drop(ws);
      return;
    }
    window.setTimeout(() => {
      if (this.ws === ws && this.lastMsgAt < sentAt) this.drop(ws);
    }, 2500);
  }

  private wake() {
    if (!this.ws) {
      this.attempt = 0;
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.probe();
      this.resync();
    }
  }

  private drop(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try {
      ws.close();
    } catch {
      /* déjà fermée */
    }
    window.clearTimeout(this.connectTimer);
    window.clearInterval(this.pingTimer);
    if (this.conn !== 'reconnecting') {
      this.conn = 'reconnecting';
      this.notify();
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    window.clearTimeout(this.reconnectTimer);
    const base = Math.min(BACKOFF_MAX_MS, 250 * 2 ** this.attempt);
    const delay = base * (0.8 + Math.random() * 0.4);
    this.attempt++;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }
}

export const store = new SyncStore();

/** Re-rend le composant à chaque changement du store. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

export function useRemoteChanges(fn: (c: RemoteChange) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => store.onRemoteChange((c) => ref.current(c)), []);
}

export function useStoreErrors(fn: (e: StoreError) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => store.onError((e) => ref.current(e)), []);
}

/** Horloge qui se rafraîchit toutes les `ms` millisecondes. */
export function useNow(ms = 20000) {
  useSyncExternalStore(
    (cb) => {
      const id = window.setInterval(cb, ms);
      return () => window.clearInterval(id);
    },
    () => Math.floor(Date.now() / ms),
  );
  return new Date();
}
