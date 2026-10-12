import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DoorPlate, Led, Link, Wordmark } from '../components/Hotel';
import { CheckIcon, DoorIcon, LockIcon, OfflineIcon, Spinner, SyncArrowsIcon } from '../components/Icons';
import { guestByLabel, whenLabel } from '../lib/format';
import { useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { displayState, type DisplayState } from '../lib/types';

const PULSE_MS = 3600;
const RECV_MS = 6000;
const ERROR_MS = 5000;
/** Durée du clignotement « message transmis » : 3 éclats de 0,8 s. */
const FLASH_MS = 2400;

/**
 * Écran bouton de chambre — plein écran, pensé mobile d'abord.
 * Le bouton imite un bouton physique : une face pressable et un anneau
 * lumineux vert (le « voyant ») qui respire tant que la demande est active
 * et clignote quand un message part vers l'équipe d'étage ou en arrive.
 */
export default function RoomButton({ number }: { number: number }) {
  const store = useStore();
  const room = store.room(number);
  const hotel = store.config?.hotel_name ?? null;

  const [pulsing, setPulsing] = useState(false);
  const [flash, setFlash] = useState(0); // identifiant du dernier éclat (relance l'animation)
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
    document.title = `Chambre ${number} · ${hotel ?? 'Green Housekeeping'}`;
  }, [number, hotel]);

  useRemoteChanges(({ room: r, stayChanged }) => {
    if (r.number !== number) return;
    setPulsing(true);
    later('pulse', PULSE_MS, () => setPulsing(false));
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
    setShake((s) => s + 1);
    later('error', ERROR_MS, () => setError(null));
  });

  if (!store.ready || !room) {
    return (
      <Shell number={number} hotel={hotel}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-sg-ink-2">
          {store.ready ? (
            <>
              <div className="sg-kiosk-title text-sg-ink">Chambre introuvable</div>
              <div className="text-[17px]">Vérifiez le numéro dans l'adresse.</div>
            </>
          ) : (
            <>
              <Spinner size={28} />
              <div className="text-[17px]">Connexion au serveur…</div>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const st = displayState(room);
  const isOn = st === 'on';
  const locked = !room.eligible || !room.stay;
  const pending = store.hasPending(number);
  const syncing = store.syncingTarget(number) !== null;
  const conn = store.conn;
  const offline = conn === 'reconnecting';

  const tap = () => {
    setRecv(null);
    if (!locked) {
      navigator.vibrate?.(12);
      startFlash();
    }
    store.toggle(number);
  };

  const aria =
    st === 'on'
      ? "Bouton allumé, voyant vert : pas de nettoyage aujourd'hui. Touchez pour demander le nettoyage."
      : st === 'off'
        ? 'Bouton éteint : nettoyage normal. Touchez pour renoncer au nettoyage.'
        : st === 'inel'
          ? 'Bouton verrouillé : option disponible à partir de 2 nuits.'
          : 'Bouton inactif : aucun séjour en cours.';

  // Voyant : clignote pendant l'envoi, éclate 3 fois à chaque message, respire sinon.
  const ledMode = pending || offline ? 'blink' : flashing ? 'flash' : 'breath';
  const pill = error ?? recv;

  return (
    <Shell number={number} hotel={hotel} status={<SyncStatus conn={conn} syncing={syncing} />}>
      <button
        type="button"
        onClick={tap}
        aria-label={aria}
        aria-pressed={isOn}
        aria-disabled={locked && !isOn}
        className="group relative -mx-6 grid flex-none place-items-center border-0 bg-transparent p-0 outline-none"
        style={{ height: 'calc(var(--sg-circle) + 96px)', cursor: locked ? 'not-allowed' : 'pointer' }}
      >
        {pill && (
          <div
            role="status"
            className={`absolute left-1/2 top-1 z-10 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-[18px] px-3.5 py-[7px] text-left text-[14px] font-medium leading-tight ${
              error ? 'bg-sg-err-soft text-sg-err' : 'bg-sg-ink text-sg-bg'
            }`}
            style={{ transform: 'translateX(-50%)', animation: 'sgFadeIn .2s ease-out', width: 'max-content' }}
          >
            {error ? <LockIcon size={15} strokeWidth={2.4} /> : <SyncArrowsIcon />}
            <span>{pill}</span>
          </div>
        )}

        <div
          key={shake}
          className="relative"
          style={{ width: 'var(--sg-circle)', height: 'var(--sg-circle)', animation: shake ? 'sgShake .4s ease-in-out' : undefined }}
        >
          {pulsing && <div className="absolute -inset-7 rounded-full border-2 border-sg-ink-3" style={{ animation: 'sgRing 1.6s ease-out infinite' }} />}
          <LedRing key={flash} st={st} mode={ledMode} />
          <Face st={st} />
        </div>
      </button>

      <LedStatus st={st} eligible={room.eligible} pending={pending} offline={offline} flashing={flashing} mode={ledMode} />
      <Headline st={st} eligible={room.eligible} />

      <div className="flex-1" />
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        {offline && <div className="max-w-[320px] text-[15px] leading-[1.4] text-sg-err">Votre choix sera transmis dès le retour de la connexion.</div>}
        {st === 'inel' ? (
          <div className="font-mono text-[13px] text-sg-ink-3">Séjour d'1 nuit · nettoyage inclus</div>
        ) : st === 'free' ? (
          <div className="font-mono text-[13px] text-sg-ink-3">Aucun séjour · bouton inactif</div>
        ) : (
          <div className="font-mono text-[13px] text-sg-ink-3">
            Dernier changement · {whenLabel(room.updated_at)} · {guestByLabel(room)}
          </div>
        )}
        {store.config?.mode === 'demo' ? (
          <div className="sg-label text-[10px] text-sg-ink-3">
            Simulation ·{' '}
            <Link href="/chambres" className="text-sg-ink underline underline-offset-[3px]">
              Changer de chambre
            </Link>
          </div>
        ) : (
          <div className="sg-label text-[10px] text-sg-ink-3">Green Housekeeping</div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ number, hotel, status, children }: { number: number; hotel: string | null; status?: ReactNode; children: ReactNode }) {
  return (
    <main
      className="flex min-h-[100dvh] w-full select-none flex-col overflow-x-hidden bg-sg-bg px-6 pt-5 text-sg-ink"
      style={{ ['--sg-circle' as string]: 'min(270px, 70vw, 34dvh)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex h-9 flex-none items-center justify-between gap-3">
        <Wordmark name={hotel} className="text-[12px] text-sg-ink-2" />
        {status}
      </div>
      <div className="mt-3 flex-none">
        <DoorPlate number={number} size="md" />
      </div>
      {children}
    </main>
  );
}

function SyncStatus({ conn, syncing }: { conn: string; syncing: boolean }) {
  if (conn === 'reconnecting')
    return (
      <div role="status" className="flex flex-none items-center gap-[7px] rounded-full bg-sg-err-soft px-3 py-1.5 text-[13px] font-medium text-sg-err">
        <OfflineIcon size={14} />
        Hors ligne
      </div>
    );
  if (conn === 'connecting' || syncing)
    return (
      <div role="status" className="flex flex-none items-center gap-2 rounded-full bg-sg-warn-soft px-3 py-1.5 text-[13px] font-medium text-sg-warn">
        <Spinner size={12} />
        {conn === 'connecting' ? 'Connexion…' : 'Envoi…'}
      </div>
    );
  return (
    <div role="status" className="flex flex-none items-center gap-[7px] text-[13px] text-sg-ink-2">
      <CheckIcon size={14} strokeWidth={2.6} />
      Synchronisé
    </div>
  );
}

/** Anneau lumineux autour du bouton : allumé (vert, lumineux) ou éteint (gris). */
function LedRing({ st, mode }: { st: DisplayState; mode: 'breath' | 'blink' | 'flash' }) {
  if (st === 'on') {
    const cls = mode === 'blink' ? 'sg-led-blink' : mode === 'flash' ? 'sg-led-flash' : 'sg-led-breath';
    return (
      <div
        aria-hidden
        className={`absolute -inset-[14px] rounded-full ${cls}`}
        style={{
          border: '5px solid var(--sg-led)',
          boxShadow: '0 0 14px var(--sg-led), 0 0 36px color-mix(in oklab, var(--sg-led) 55%, transparent), inset 0 0 12px color-mix(in oklab, var(--sg-led) 60%, transparent)',
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="absolute -inset-[14px] rounded-full"
      style={{ border: st === 'off' ? '5px solid var(--sg-line-strong)' : '3px dashed var(--sg-line-strong)' }}
    />
  );
}

const faceBase =
  'absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-full transition-transform duration-switch ease-out group-active:scale-[.965]';
const tag = 'sg-wide text-kiosk-tag';
const hint = 'max-w-[180px] text-center text-[14px] leading-[1.35]';

/** Face du bouton : en relief, elle s'enfonce légèrement sous le doigt. */
function Face({ st }: { st: DisplayState }) {
  if (st === 'on')
    return (
      <div className={`${faceBase} bg-sg-on text-sg-on-fg shadow-raised`}>
        <CheckIcon size={72} strokeWidth={2.4} />
        <div className={tag}>Allumé</div>
        <div className={hint}>Touchez pour demander le nettoyage</div>
      </div>
    );
  if (st === 'off')
    return (
      <div className={`${faceBase} bg-sg-surface text-sg-ink shadow-raised`}>
        <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
        <div className={tag}>Éteint</div>
        <div className={`${hint} text-sg-ink-2`}>Touchez pour renoncer au nettoyage</div>
      </div>
    );
  return (
    <div className={`${faceBase} bg-sg-surface-2 text-sg-ink-2`}>
      {st === 'inel' ? <LockIcon size={60} strokeWidth={2} /> : <DoorIcon size={60} strokeWidth={2} />}
      <div className={tag}>{st === 'inel' ? 'Verrouillé' : 'Inactif'}</div>
      <div className={hint}>{st === 'inel' ? 'Non actionnable pour ce séjour' : 'Aucun séjour en cours'}</div>
    </div>
  );
}

/** Ligne du voyant : traduit en mots ce que dit la lumière (jamais la couleur seule). */
function LedStatus({
  st,
  eligible,
  pending,
  offline,
  flashing,
  mode,
}: {
  st: DisplayState;
  eligible: boolean;
  pending: boolean;
  offline: boolean;
  flashing: boolean;
  mode: 'breath' | 'blink' | 'flash';
}) {
  let icon: ReactNode;
  let text: string;
  if (st === 'on') {
    icon = <Led on mode={mode} size={11} />;
    text = offline && pending
      ? 'Voyant vert · en attente de connexion'
      : pending
        ? 'Voyant vert · envoi en cours…'
        : !eligible
          ? 'Voyant vert · réglé par la gouvernante'
          : flashing
            ? 'Voyant vert · message transmis'
            : 'Voyant vert · équipe d’étage prévenue';
  } else if (st === 'off') {
    icon = <Led on={false} size={11} />;
    text = pending ? 'Voyant éteint · envoi en cours…' : 'Voyant éteint · nettoyage prévu';
  } else if (st === 'inel') {
    icon = <LockIcon size={14} strokeWidth={2.4} />;
    text = 'Bouton verrouillé · séjour d’1 nuit';
  } else {
    icon = <DoorIcon size={14} strokeWidth={2.4} />;
    text = 'Aucun séjour en cours';
  }
  return (
    <div role="status" aria-live="polite" className="mx-auto mb-5 mt-1 flex items-center gap-2.5 rounded-full border border-sg-line bg-sg-surface px-4 py-2 text-[14px] font-medium text-sg-ink-2">
      {icon}
      <span>{text}</span>
    </div>
  );
}

const Eur = () => <span className="font-semibold text-sg-ink">5 €</span>;

function Headline({ st, eligible }: { st: DisplayState; eligible: boolean }) {
  const title = 'sg-kiosk-title text-balance';
  const body = 'max-w-[320px] text-pretty text-[17px] leading-[1.45] text-sg-ink-2';
  if (st === 'on')
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={title}>Pas de nettoyage aujourd'hui</div>
        <div className={body}>
          {eligible ? (
            <>
              Merci pour ce geste. Un voucher boisson de <Eur /> vous attend au bar.
            </>
          ) : (
            'Réglé par la gouvernante pour votre séjour.'
          )}
        </div>
      </div>
    );
  if (st === 'off')
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className={title}>Nettoyage normal</div>
        <div className={body}>
          Allumez le bouton pour renoncer au nettoyage et recevoir un voucher boisson de <Eur /> au bar.
        </div>
      </div>
    );
  if (st === 'inel')
    return (
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className={title}>Nettoyage normal</div>
        <div className="text-[18px] font-medium leading-[1.3]">Option disponible à partir de 2 nuits</div>
        <div className="max-w-[320px] text-pretty text-[16px] leading-[1.45] text-sg-ink-2">
          Votre séjour d'une nuit inclut le nettoyage. Le voucher boisson de <Eur /> est proposé dès 2 nuits.
        </div>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <div className={title}>Chambre libre</div>
      <div className="max-w-[320px] text-[16px] leading-[1.45] text-sg-ink-2">Le bouton s'activera à l'arrivée du prochain client.</div>
    </div>
  );
}
