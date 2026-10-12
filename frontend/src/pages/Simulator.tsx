import { useEffect, useRef, useState } from 'react';
import { DoorPlate, FloorHeading, Link, LobbyConnection, LobbyHeader } from '../components/Hotel';
import { AlertIcon, CheckIcon, ChevronIcon, DoorIcon, LockIcon, Spinner, SyncArrowsIcon } from '../components/Icons';
import { STATE_LABEL } from '../components/RoomTile';
import { stayStatus } from '../lib/format';
import { useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { displayState, type DisplayState, type Room } from '../lib/types';

/**
 * Simulateur client (mode démo) : un téléphone joue le client de n'importe
 * quelle chambre, ou de plusieurs à la fois. Chaque pastille envoie exactement
 * la même requête que l'écran bouton de la chambre.
 */
export default function Simulator() {
  const store = useStore();
  const [pulse, setPulse] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    document.title = 'Simulateur client · Green Housekeeping';
    return () => Object.values(timers.current).forEach((t) => window.clearTimeout(t));
  }, []);

  useRemoteChanges(({ room, stayChanged }) => {
    if (room.updated_by === 'guest' && !stayChanged) return;
    const n = room.number;
    setPulse((p) => ({ ...p, [n]: stayChanged || room.updated_by === 'system' ? 'Séjour mis à jour' : 'Modifié par la gouvernante' }));
    window.clearTimeout(timers.current['p' + n]);
    timers.current['p' + n] = window.setTimeout(
      () =>
        setPulse((p) => {
          const { [n]: _drop, ...rest } = p;
          return rest;
        }),
      3600,
    );
  });

  useStoreErrors((e) => {
    setToast(e.room ? `Chambre ${e.room} · ${e.message}` : e.message);
    window.clearTimeout(timers.current.toast);
    timers.current.toast = window.setTimeout(() => setToast(null), 5000);
  });

  const rooms = store.list();
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  return (
    <div className="min-h-[100dvh] bg-sg-bg text-sg-ink">
      <LobbyHeader hotel={store.config?.hotel_name ?? null} section="Simulateur client" compact>
        <LobbyConnection conn={store.conn} short />
      </LobbyHeader>

      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-5">
        <div className="rounded-sg-md border-[1.5px] border-dashed border-demo-line bg-demo-bg px-4 py-3 text-[14px] leading-[1.45] text-demo-ink">
          <span className="mr-2 rounded-sg-xs bg-demo-accent px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[.08em] text-demo-accent-ink">Démo</span>
          Touchez une pastille pour agir comme le client de la chambre, ou ouvrez son écran complet. Vous pouvez piloter plusieurs chambres
          à la fois.
        </div>

        {!store.ready ? (
          <div className="flex items-center justify-center gap-3 py-12 text-[15px] text-sg-ink-2">
            <Spinner /> Connexion au serveur…
          </div>
        ) : (
          floors.map((floor) => {
            const list = rooms.filter((r) => r.floor === floor);
            return (
              <section key={floor}>
                <FloorHeading floor={floor} meta={`${list.length} chambres`} />
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {list.map((r) => (
                    <SimRow key={r.number} room={r} pulse={pulse[r.number]} syncing={store.syncingTarget(r.number) !== null} onTap={() => store.toggle(r.number)} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-10 flex w-[calc(100%-32px)] max-w-[560px] items-start gap-2.5 rounded-sg-md bg-sg-err-soft px-4 py-3 text-[14px] font-medium leading-[1.4] text-sg-err shadow-sg"
          style={{ transform: 'translateX(-50%)' }}
        >
          <AlertIcon size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function SimRow({ room: r, pulse, syncing, onTap }: { room: Room; pulse?: string; syncing: boolean; onTap: () => void }) {
  const st = displayState(r);
  const status = r.stay ? stayStatus(r.stay) : null;
  return (
    <li
      className="flex items-center gap-3 rounded-sg-lg border bg-sg-surface px-3 py-3"
      style={{
        borderColor: st === 'on' ? 'var(--sg-on)' : 'var(--sg-line)',
        animation: pulse ? 'sgTilePulse 1.2s ease-out 3' : 'none',
      }}
    >
      <DoorPlate number={r.number} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold" style={{ color: st === 'on' ? 'var(--sg-on-ink)' : 'var(--sg-ink)' }}>
          {STATE_LABEL[st]}
        </div>
        <div className="truncate text-[13px] text-sg-ink-2">
          {pulse ? (
            <span className="inline-flex items-center gap-1 font-medium text-sg-ink">
              <SyncArrowsIcon size={12} />
              {pulse}
            </span>
          ) : status ? (
            status.label
          ) : (
            'Aucun séjour'
          )}
        </div>
      </div>
      <MiniButton state={st} number={r.number} syncing={syncing} onTap={onTap} />
      <Link
        href={`/chambre/${r.number}`}
        aria-label={`Ouvrir l'écran de la chambre ${r.number}`}
        className="grid h-11 w-9 flex-none place-items-center rounded-sg-sm text-sg-ink-2"
      >
        <span className="-rotate-90">
          <ChevronIcon size={18} />
        </span>
      </Link>
    </li>
  );
}

/** Pastille : même forme que le grand bouton (disque, anneau, pointillés). */
function MiniButton({ state, number, syncing, onTap }: { state: DisplayState; number: number; syncing: boolean; onTap: () => void }) {
  const base = 'relative grid h-14 w-14 flex-none cursor-pointer place-items-center rounded-full p-0';
  const label =
    state === 'on'
      ? `Chambre ${number} : allumé. Touchez pour demander le nettoyage.`
      : state === 'off'
        ? `Chambre ${number} : éteint. Touchez pour renoncer au nettoyage.`
        : `Chambre ${number} : bouton verrouillé.`;
  const tap = () => {
    navigator.vibrate?.(10);
    onTap();
  };
  return (
    <button
      type="button"
      onClick={tap}
      aria-label={label}
      aria-pressed={state === 'on'}
      className={`${base} ${
        state === 'on'
          ? 'border-0 bg-sg-on text-sg-on-fg'
          : state === 'off'
            ? 'border-[3px] border-sg-ink bg-sg-surface text-sg-ink'
            : 'border-2 border-dashed border-sg-line-strong bg-sg-surface-2 text-sg-ink-2'
      }`}
      style={state === 'on' ? { boxShadow: '0 0 0 5px var(--sg-on-soft)' } : undefined}
    >
      {state === 'on' ? (
        <CheckIcon size={26} strokeWidth={2.6} />
      ) : state === 'off' ? (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden>
          <circle cx="12" cy="12" r="7.5" />
        </svg>
      ) : state === 'inel' ? (
        <LockIcon size={22} />
      ) : (
        <DoorIcon size={22} />
      )}
      {syncing && (
        <span
          className="absolute -inset-1.5 rounded-full border-[3px] border-transparent"
          style={{ borderTopColor: 'var(--sg-warn)', borderRightColor: 'var(--sg-warn)', animation: 'sgSpin 1s linear infinite' }}
        />
      )}
    </button>
  );
}
