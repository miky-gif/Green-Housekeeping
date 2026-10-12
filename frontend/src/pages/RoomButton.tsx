import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '../components/Hotel';
import { CheckIcon, DoorIcon, LockIcon, OfflineIcon, Spinner, SyncArrowsIcon } from '../components/Icons';
import { guestByLabel, whenLabel } from '../lib/format';
import { useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { displayState } from '../lib/types';

const PULSE_MS = 3600;
const RECV_MS = 6000;
const ERROR_MS = 5000;

/** Écran bouton de chambre — plein écran, pensé mobile d'abord (maquettes A1–A3, A·S1–S3). */
export default function RoomButton({ number }: { number: number }) {
  const store = useStore();
  const room = store.room(number);

  const [pulsing, setPulsing] = useState(false);
  const [recv, setRecv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const timers = useRef<Record<string, number>>({});

  const later = (key: string, ms: number, fn: () => void) => {
    window.clearTimeout(timers.current[key]);
    timers.current[key] = window.setTimeout(fn, ms);
  };
  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    document.title = `Chambre ${number} · Green Housekeeping`;
  }, [number]);

  useRemoteChanges(({ room: r, stayChanged }) => {
    if (r.number !== number) return;
    setPulsing(true);
    later('pulse', PULSE_MS, () => setPulsing(false));
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
    setShake((s) => s + 1);
    later('error', ERROR_MS, () => setError(null));
  });

  if (!store.ready || !room) {
    return (
      <Shell number={number}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-sg-ink-2">
          {store.ready ? (
            <>
              <div className="text-kiosk-state">Chambre introuvable</div>
              <div className="text-[18px]">Vérifiez le numéro dans l'adresse.</div>
            </>
          ) : (
            <>
              <Spinner size={28} />
              <div className="text-[18px]">Connexion au serveur…</div>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const st = displayState(room);
  const isOn = st === 'on';
  const locked = !room.eligible || !room.stay;
  const syncing = store.syncingTarget(number) !== null;
  const conn = store.conn;
  const offline = conn === 'reconnecting';

  const tap = () => {
    setRecv(null);
    if (!locked) navigator.vibrate?.(12);
    store.toggle(number);
  };

  const aria =
    st === 'on'
      ? "Bouton allumé : pas de nettoyage aujourd'hui. Touchez pour demander le nettoyage."
      : st === 'off'
        ? 'Bouton éteint : nettoyage normal. Touchez pour renoncer au nettoyage.'
        : st === 'inel'
          ? 'Bouton verrouillé : option disponible à partir de 2 nuits.'
          : 'Bouton inactif : aucun séjour en cours.';

  const pill = error ?? recv;

  return (
    <Shell number={number} status={<SyncStatus conn={conn} syncing={syncing} />}>
      <button
        type="button"
        onClick={tap}
        aria-label={aria}
        aria-pressed={isOn}
        aria-disabled={locked && !isOn}
        className="relative -mx-7 grid flex-none place-items-center border-0 bg-transparent p-0"
        style={{ height: 'min(470px, 56dvh)', cursor: locked ? 'not-allowed' : 'pointer' }}
      >
        {pill && (
          <div
            role="status"
            className={`absolute left-1/2 top-2.5 z-10 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-[20px] px-3.5 py-[7px] text-left text-[14px] font-medium leading-tight ${
              error ? 'bg-sg-err-soft text-sg-err' : 'bg-sg-surface-2 text-sg-ink'
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
          style={{
            width: 'var(--sg-circle)',
            height: 'var(--sg-circle)',
            animation: shake ? 'sgShake .4s ease-in-out' : undefined,
          }}
        >
          {pulsing && (
            <div className="absolute -inset-4 rounded-full border-[3px] border-sg-ink-2" style={{ animation: 'sgRing 1.6s ease-out infinite' }} />
          )}
          {(syncing || (offline && store.hasPending(number))) && (
            <div
              className="absolute -inset-[18px] rounded-full border-4 border-transparent"
              style={{
                borderTopColor: offline ? 'var(--sg-err)' : 'var(--sg-warn)',
                borderRightColor: offline ? 'var(--sg-err)' : 'var(--sg-warn)',
                animation: 'sgSpin 1s linear infinite',
              }}
            />
          )}
          <Circle st={st} />
        </div>
      </button>

      <Headline st={st} eligible={room.eligible} />

      <div className="flex-1" />
      <div className="flex flex-col items-center gap-2 text-center">
        {offline && <div className="max-w-[320px] text-[15px] leading-[1.4] text-sg-err">Votre choix sera transmis dès le retour de la connexion.</div>}
        {st === 'inel' ? (
          <div className="font-mono text-[14px] text-sg-ink-3">Séjour d'1 nuit · nettoyage inclus</div>
        ) : st === 'free' ? (
          <div className="font-mono text-[14px] text-sg-ink-3">Aucun séjour · bouton inactif</div>
        ) : (
          <div className="font-mono text-[14px] text-sg-ink-3">
            Dernier changement · {whenLabel(room.updated_at)} · {guestByLabel(room)}
          </div>
        )}
        {store.config?.mode === 'demo' ? (
          <div className="font-mono text-[11px] uppercase tracking-[.08em] text-sg-ink-3">
            Simulation web du bouton de chambre ·{' '}
            <Link href="/chambres" className="text-sg-ink-2 underline underline-offset-[3px]">
              Changer de chambre
            </Link>
          </div>
        ) : (
          store.config && <div className="font-mono text-[11px] uppercase tracking-[.08em] text-sg-ink-3">{store.config.hotel_name} · Green Housekeeping</div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ number, status, children }: { number: number; status?: ReactNode; children: ReactNode }) {
  return (
    <main
      className="flex min-h-[100dvh] w-full select-none flex-col overflow-x-hidden bg-sg-bg px-7 pb-6 pt-[22px] text-sg-ink"
      style={{ ['--sg-circle' as string]: 'min(316px, 78vw, 40dvh)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex h-11 flex-none items-center justify-between">
        <div className="flex items-baseline gap-1.5 text-[18px] text-sg-ink-2">
          Chambre <span className="font-semibold tabular-nums text-sg-ink">{number}</span>
        </div>
        {status}
      </div>
      {children}
    </main>
  );
}

function SyncStatus({ conn, syncing }: { conn: string; syncing: boolean }) {
  if (conn === 'reconnecting')
    return (
      <div role="status" className="flex items-center gap-[7px] rounded-full bg-sg-err-soft px-3 py-[7px] text-[14px] font-medium text-sg-err">
        <OfflineIcon />
        Hors ligne
      </div>
    );
  if (conn === 'connecting' || syncing)
    return (
      <div role="status" className="flex items-center gap-2 rounded-full bg-sg-warn-soft px-3 py-[7px] text-[14px] font-medium text-sg-warn">
        <Spinner />
        {conn === 'connecting' ? 'Connexion…' : 'Synchronisation…'}
      </div>
    );
  return (
    <div role="status" className="flex items-center gap-[7px] text-[14px] text-sg-ink-2">
      <CheckIcon strokeWidth={2.6} />
      Synchronisé
    </div>
  );
}

const circleBase = 'flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-full box-border';
const tag = 'text-kiosk-tag uppercase';
const hint = 'max-w-[200px] text-center text-[15px] leading-[1.35]';

function Circle({ st }: { st: ReturnType<typeof displayState> }) {
  if (st === 'on')
    return (
      <div className={`${circleBase} bg-sg-on text-sg-on-fg`} style={{ boxShadow: '0 0 0 14px var(--sg-on-soft)' }}>
        <CheckIcon size={92} strokeWidth={2.4} />
        <div className={tag}>Allumé</div>
        <div className={hint}>Touchez pour demander le nettoyage</div>
      </div>
    );
  if (st === 'off')
    return (
      <div className={`${circleBase} border-[6px] border-sg-ink bg-sg-surface text-sg-ink shadow-sg`}>
        <svg width={84} height={84} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
        <div className={tag}>Éteint</div>
        <div className={`${hint} text-sg-ink-2`}>Touchez pour renoncer au nettoyage</div>
      </div>
    );
  return (
    <div className={`${circleBase} border-4 border-dashed border-sg-line-strong bg-sg-surface-2 text-sg-ink-2`}>
      {st === 'inel' ? <LockIcon size={78} strokeWidth={2} /> : <DoorIcon size={78} strokeWidth={2} />}
      <div className={tag}>{st === 'inel' ? 'Verrouillé' : 'Inactif'}</div>
      <div className={hint}>{st === 'inel' ? 'Non actionnable pour ce séjour' : 'Aucun séjour en cours'}</div>
    </div>
  );
}

const Eur = () => <span className="font-semibold text-sg-ink">5 €</span>;

function Headline({ st, eligible }: { st: ReturnType<typeof displayState>; eligible: boolean }) {
  const title = 'sg-kiosk-title text-balance';
  const body = 'max-w-[320px] text-pretty text-[18px] leading-[1.45] text-sg-ink-2';
  if (st === 'on')
    return (
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className={title}>Pas de nettoyage aujourd'hui</div>
        <div className={body}>
          {eligible ? (
            <>
              Un voucher boisson de <Eur /> vous attend au bar.
            </>
          ) : (
            'Réglé par la gouvernante pour votre séjour.'
          )}
        </div>
      </div>
    );
  if (st === 'off')
    return (
      <div className="flex flex-col items-center gap-3.5 text-center">
        <div className={title}>Nettoyage normal</div>
        <div className={body}>
          Allumez le bouton pour renoncer au nettoyage et recevoir un voucher boisson de <Eur /> au bar.
        </div>
      </div>
    );
  if (st === 'inel')
    return (
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="sg-kiosk-title">Nettoyage normal</div>
        <div className="text-[20px] font-medium leading-[1.3]">Option disponible à partir de 2 nuits</div>
        <div className="max-w-[320px] text-pretty text-[17px] leading-[1.45] text-sg-ink-2">
          Votre séjour d'une nuit inclut le nettoyage. Le voucher boisson de <Eur /> est proposé dès 2 nuits.
        </div>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <div className="sg-kiosk-title">Chambre libre</div>
      <div className="max-w-[320px] text-[17px] leading-[1.45] text-sg-ink-2">Le bouton s'activera à l'arrivée du prochain client.</div>
    </div>
  );
}
