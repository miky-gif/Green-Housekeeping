import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, Spinner } from '../components/Icons';
import { hhmm } from '../lib/format';
import { useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { displayState, type DisplayState, type Room } from '../lib/types';

const RECV_MS = 6000;
const ERROR_MS = 5000;
/** Clignotement « message transmis » : 3 éclats de 0,8 s. */
const FLASH_MS = 2400;

/**
 * Bouton en chambre — maquettes 3a (allumé), 3b (éteint), 3c (non éligible).
 * Le halo orange « respire » tant que la demande est active et clignote quand
 * un message part vers l'équipe d'étage ou en arrive.
 */
export default function RoomButton({ number }: { number: number }) {
  const store = useStore();
  const room = store.room(number);
  const config = store.config;

  const [flash, setFlash] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [recv, setRecv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const timers = useRef<Record<string, number>>({});

  const later = (key: string, ms: number, fn: () => void) => {
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(fn, ms);
  };
  const startFlash = () => {
    setFlash((f) => f + 1);
    setFlashing(true);
    later('flash', FLASH_MS, () => setFlashing(false));
  };
  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    document.title = `Chambre ${number} · ${config?.hotel_name ?? 'GreenKeeping'}`;
  }, [number, config?.hotel_name]);

  useRemoteChanges(({ room: r, stayChanged }) => {
    if (r.number !== number) return;
    startFlash();
    if (r.updated_by !== 'guest' || stayChanged) {
      setRecv(r.updated_by === 'staff' && !stayChanged ? 'Modifié par la gouvernante' : 'Séjour mis à jour');
      setError(null);
      later('recv', RECV_MS, () => setRecv(null));
    }
  });

  useStoreErrors((e) => {
    if (e.room !== number) return;
    setError(e.message);
    setRecv(null);
    setFlashing(false);
    setShake(1);
    later('shake', 450, () => setShake(0));
    later('error', ERROR_MS, () => setError(null));
  });

  const conn = store.conn;
  const offline = conn === 'reconnecting';

  if (!store.ready || !room) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-ink-500">
          {store.ready ? (
            <>
              <h1 className="m-0 text-[28px] font-bold tracking-[-.02em] text-ink-900">Chambre introuvable</h1>
              <p className="m-0 text-[15px]">Vérifiez le numéro dans l’adresse.</p>
            </>
          ) : (
            <>
              <Spinner size={26} />
              <p className="m-0 text-[15px]">Connexion…</p>
            </>
          )}
        </div>
      </Screen>
    );
  }

  const st = displayState(room);
  const locked = !room.eligible || !room.stay;
  const pending = store.hasPending(number);
  const syncing = store.syncingTarget(number) !== null;

  const tap = () => {
    setRecv(null);
    if (!locked) {
      navigator.vibrate?.(12);
      startFlash();
    }
    store.toggle(number);
  };

  const halo = st === 'on' ? (pending || offline ? 'gk-blink' : flashing ? 'gk-flash' : 'gk-breath') : '';
  const pill = error ?? recv;
  const label =
    st === 'on'
      ? 'Pas de nettoyage aujourd’hui. Touchez pour demander le nettoyage.'
      : st === 'off'
        ? 'Nettoyage normal. Touchez pour renoncer au nettoyage.'
        : st === 'inel'
          ? 'Option disponible dès deux nuits.'
          : 'Aucun séjour en cours.';

  return (
    <Screen>
      <div className="flex w-full flex-col items-center gap-3">
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">
          <span>Chambre {room.number}</span>
          <span className="h-1 w-1 rounded-full bg-ink-300" />
          <span>Étage {room.floor}</span>
        </div>
        <Connection conn={conn} syncing={syncing} />
      </div>

      <div className="relative flex flex-col items-center gap-10">
        {pill && (
          <div
            role="status"
            className={`absolute -top-14 left-1/2 z-10 flex w-max max-w-[calc(100vw-48px)] -translate-x-1/2 items-center gap-2 rounded-[18px] px-3.5 py-2 text-[13px] font-semibold leading-tight ${
              error ? 'bg-err-bg text-err-text' : 'bg-ink-900 text-surface'
            }`}
            style={{ animation: 'gkFade .2s ease-out' }}
          >
            <Icon name={error ? 'lock' : 'reset'} size={15} />
            <span>{pill}</span>
          </div>
        )}

        <div className="relative" style={{ animation: shake ? 'gkShake .4s ease-in-out' : undefined }}>
        {st === 'on' && <span key={flash} aria-hidden className={`pointer-events-none absolute inset-0 rounded-full ${halo}`} />}
        <button
          type="button"
          role="switch"
          aria-checked={st === 'on'}
          aria-disabled={locked}
          aria-label={label}
          onClick={tap}
          className={`relative grid cursor-pointer place-items-center rounded-full p-0 transition-transform duration-150 active:scale-[.965] ${
            st === 'on' ? 'border-0 bg-brand-500 text-white' : st === 'off' ? 'border-2 border-line bg-surface text-ink-500' : 'cursor-not-allowed border-2 border-line text-ink-300'
          }`}
          style={{
            width: 'min(240px, 62vw)',
            height: 'min(240px, 62vw)',
            background: st === 'inel' || st === 'free' ? 'color-mix(in oklab, var(--surface) 55%, transparent)' : undefined,
          }}
        >
          <Icon name={st === 'inel' ? 'lock' : st === 'free' ? 'door' : 'power'} size={64} stroke={st === 'on' ? 2 : 1.8} />
        </button>
        </div>

        <Message room={room} st={st} drinkMessage={config?.drink_message} />
      </div>

      <div className="flex flex-col items-center gap-2.5 text-center">
        {offline && <span className="max-w-[300px] text-[13px] leading-[1.45] text-err-text">Votre choix sera transmis dès le retour de la connexion.</span>}
        <span className="text-[13px] tabular-nums text-ink-500">{footerLine(room, st)}</span>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-700">
          <span className="flex text-ok-text">
            <Icon name="leaf" size={16} />
          </span>
          Un geste pour nos engagements Green Key
        </span>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <main
      className="flex min-h-[100dvh] w-full select-none flex-col items-center justify-between gap-8 overflow-x-hidden bg-brand-50 px-8 text-ink-700"
      style={{ paddingTop: 'max(48px, env(safe-area-inset-top))', paddingBottom: 'max(36px, env(safe-area-inset-bottom))' }}
    >
      {children}
    </main>
  );
}

/** Indicateur de connexion discret (exigé sur les deux écrans). */
function Connection({ conn, syncing }: { conn: string; syncing: boolean }) {
  if (conn === 'reconnecting')
    return (
      <span role="status" className="flex items-center gap-1.5 rounded-full bg-err-bg px-2.5 py-1 text-[12px] font-semibold text-err-text">
        <Icon name="wifiOff" size={13} /> Hors ligne
      </span>
    );
  if (conn === 'connecting' || syncing)
    return (
      <span role="status" className="flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-1 text-[12px] font-semibold text-warn-text">
        <Spinner size={10} /> {conn === 'connecting' ? 'Connexion…' : 'Envoi…'}
      </span>
    );
  return (
    <span role="status" className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
      <span className="h-1.5 w-1.5 rounded-full bg-ok-dot" /> Synchronisé
    </span>
  );
}

function Message({ room, st, drinkMessage }: { room: Room; st: DisplayState; drinkMessage?: string }) {
  const title =
    st === 'on' ? 'Pas de nettoyage aujourd’hui' : st === 'off' ? 'Nettoyage normal' : st === 'inel' ? 'Disponible dès deux nuits' : 'Chambre libre';
  const body =
    st === 'on'
      ? room.eligible
        ? drinkMessage || 'Merci. Une boisson vous est offerte au bar.'
        : 'Réglé par la gouvernante pour votre séjour.'
      : st === 'off'
        ? 'Votre chambre sera faite aujourd’hui. Touchez pour y renoncer.'
        : st === 'inel'
          ? 'Votre chambre sera faite chaque jour de votre séjour.'
          : 'Le bouton s’activera à l’arrivée du prochain client.';
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="m-0 max-w-[320px] text-balance text-[28px] font-bold leading-[1.2] tracking-[-.02em] text-ink-900">{title}</h1>
      <p className="m-0 w-[260px] max-w-full text-pretty text-[15px] leading-[1.6] text-ink-700">{body}</p>
    </div>
  );
}

function footerLine(r: Room, st: DisplayState): string {
  if (st === 'inel') return 'Séjour d’une nuit';
  if (st === 'free') return 'Aucun séjour en cours';
  const by = { guest: 'par vous', staff: 'par la gouvernante', system: 'par le système' }[r.updated_by];
  const sameDay = new Date(r.updated_at).toDateString() === new Date().toDateString();
  return `${st === 'on' ? 'Allumé' : 'Éteint'} ${sameDay ? 'à' : 'hier à'} ${hhmm(r.updated_at)} ${by}`;
}
