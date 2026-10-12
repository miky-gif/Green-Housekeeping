import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertIcon, CloseIcon, LockIcon, OnDiscIcon, RingIcon, Spinner } from '../components/Icons';
import { FloorHeading, LeafIcon, LobbyConnection, LobbyHeader } from '../components/Hotel';
import RoomPanel from '../components/RoomPanel';
import RoomTile from '../components/RoomTile';
import DemoBar from '../components/DemoBar';
import { dayLabel, duration, hhmm, longDate } from '../lib/format';
import { useNow, useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { displayState, type DisplayState, type Room } from '../lib/types';

type Filter = 'all' | 'on' | 'off' | 'inel';
const PULSE_MS = 3600;

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
}

/** Vue gouvernante : plan de ménage du jour, étage par étage. */
export default function Dashboard() {
  const store = useStore();
  const now = useNow(20000);
  const width = useWidth();
  const desktop = width >= 1280;
  const config = store.config;

  const [filter, setFilter] = useState<Filter>('all');
  const [panel, setPanel] = useState<number | null>(null);
  const [pulse, setPulse] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<Record<string, number>>({});

  useEffect(() => {
    document.title = `Gouvernante · ${config?.hotel_name ?? 'Green Housekeeping'}`;
  }, [config?.hotel_name]);
  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useRemoteChanges(({ room, stayChanged }) => {
    const note = stayChanged || room.updated_by === 'system' ? 'Séjour modifié' : room.updated_by === 'guest' ? 'Reçu · client' : 'Reçu · gouvernante';
    const n = room.number;
    setPulse((p) => ({ ...p, [n]: note }));
    window.clearTimeout(timers.current['p' + n]);
    timers.current['p' + n] = window.setTimeout(
      () =>
        setPulse((p) => {
          const { [n]: _drop, ...rest } = p;
          return rest;
        }),
      PULSE_MS,
    );
  });

  useStoreErrors((e) => {
    setToast(e.room ? `Chambre ${e.room} · ${e.message}` : e.message);
    window.clearTimeout(timers.current.toast);
    timers.current.toast = window.setTimeout(() => setToast(null), 6000);
  });

  const closePanel = useCallback(() => setPanel(null), []);

  const rooms = store.list();
  const states = new Map<number, DisplayState>(rooms.map((r) => [r.number, displayState(r)]));
  const count = (k: DisplayState, list: Room[] = rooms) => list.filter((r) => states.get(r.number) === k).length;
  const visible = rooms.filter((r) => filter === 'all' || states.get(r.number) === filter);
  const panelRoom = panel !== null ? store.room(panel) : undefined;
  const occupied = rooms.filter((r) => r.stay).length;

  // Impact : recouches évitées (séjours éligibles allumés) et vouchers émis aujourd'hui.
  const skipped = rooms.filter((r) => r.stay && r.eligible && r.state === 'on').length;
  const minutes = skipped * (config?.minutes_per_cleaning ?? 25);
  const vouchersToday = rooms.filter((r) => r.voucher && dayLabel(r.voucher.issued_at) === "Aujourd'hui").length;

  const floors = [...new Set(visible.map((r) => r.floor))].sort((a, b) => a - b);
  const cols = desktop ? (panelRoom ? 4 : 5) : width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const conn = store.conn;

  const filters: [Filter, string, number][] = [
    ['all', 'Toutes', rooms.length],
    ['on', 'Pas de nettoyage', count('on')],
    ['off', 'Nettoyage', count('off')],
    ['inel', 'Non éligibles', count('inel')],
  ];

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-sg-bg text-sg-ink">
      <LobbyHeader hotel={config?.hotel_name ?? null} section="Service des étages · Gouvernante">
        <div className="hidden text-right md:block">
          <div className="text-[14px] text-lobby-ink">{longDate(now)}</div>
          <div className="font-mono text-[13px] text-lobby-ink-2">{hhmm(now)}</div>
        </div>
        <LobbyConnection conn={conn} short={width < 640} />
      </LobbyHeader>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto px-4 pb-28 pt-8 sm:px-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="font-mono text-overline uppercase text-brass-ink">
                  {greeting(now)} · Green Housekeeping
                </div>
                <h1 className="mt-1.5 font-display text-display font-normal">Plan de ménage du jour</h1>
                <div className="mt-2 text-[15px] text-sg-ink-2">
                  {occupied} chambre{occupied > 1 ? 's' : ''} occupée{occupied > 1 ? 's' : ''} sur {rooms.length}
                  {rooms.length - occupied > 0 ? ` · ${rooms.length - occupied} libre${rooms.length - occupied > 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-[14px] text-sg-ink-2">
                <div className="flex items-center gap-2">
                  <OnDiscIcon size={16} strokeWidth={2.8} />
                  Bouton allumé (vert) = pas de nettoyage
                </div>
                <div className="flex items-center gap-2">
                  <RingIcon size={16} strokeWidth={2.8} />
                  Bouton éteint = nettoyage normal
                </div>
              </div>
            </div>

            {conn === 'reconnecting' && (
              <div role="alert" className="mb-5 flex items-center gap-3 rounded-sg-md bg-sg-warn-soft px-4 py-3 text-[14px] font-medium leading-[1.4] text-sg-warn">
                <AlertIcon />
                Connexion temps réel interrompue. Les états affichés datent de {store.lastSyncAt ? hhmm(new Date(store.lastSyncAt)) : '—'} ; vos forçages seront
                envoyés à la reconnexion.
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
              <div className="grid grid-cols-1 rounded-sg-lg border border-sg-line bg-sg-surface sm:grid-cols-3">
                <Counter icon={<OnDiscIcon size={20} />} title="À ne pas nettoyer" value={count('on')} sub="Bouton allumé · recouche évitée" />
                <Counter icon={<RingIcon size={20} />} title="À nettoyer" value={count('off')} sub="Bouton éteint · nettoyage normal" bordered />
                <Counter icon={<LockIcon size={20} />} title="Non éligibles" value={count('inel')} sub="Séjour d'1 nuit · nettoyage normal" bordered />
              </div>
              <div className="flex flex-col justify-between gap-3 rounded-sg-lg border border-brass bg-brass-soft px-6 py-5">
                <div className="flex items-center gap-2.5 text-[15px] font-semibold text-brass-ink">
                  <LeafIcon />
                  Impact du jour
                </div>
                <div>
                  <div className="font-display text-[44px] leading-none tabular-nums">{minutes ? `≈ ${duration(minutes)}` : '—'}</div>
                  <div className="mt-1.5 text-[14px] text-sg-ink-2">de ménage libérées pour l'équipe</div>
                </div>
                <div className="text-[13px] leading-[1.4] text-sg-ink-2">
                  {skipped} recouche{skipped > 1 ? 's' : ''} évitée{skipped > 1 ? 's' : ''} · {vouchersToday} voucher{vouchersToday > 1 ? 's' : ''} émis aujourd'hui
                  <br />
                  <span className="text-sg-ink-3">Estimation : {config?.minutes_per_cleaning ?? 25} min par recouche</span>
                </div>
              </div>
            </div>

            <div className="mb-2 mt-7 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1 rounded-sg-md bg-sg-surface-2 p-1" role="group" aria-label="Filtrer les chambres">
                {filters.map(([k, label, n]) => {
                  const active = filter === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(k)}
                      className={`flex h-10 items-center gap-2 rounded-[9px] border-0 px-4 text-[14px] font-medium ${
                        active ? 'bg-sg-surface text-sg-ink shadow-sg' : 'bg-transparent text-sg-ink-2'
                      }`}
                    >
                      {label}
                      <span className="font-mono text-[13px]">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[14px] text-sg-ink-2">Touchez une chambre pour son séjour, son bouton et son historique</div>
            </div>

            {!store.ready ? (
              <div className="flex items-center justify-center gap-3 py-12 text-[15px] text-sg-ink-2">
                <Spinner /> Connexion au serveur…
              </div>
            ) : (
              floors.map((floor) => {
                const list = visible.filter((r) => r.floor === floor);
                const all = rooms.filter((r) => r.floor === floor);
                const toClean = count('off', all);
                return (
                  <section key={floor} aria-label={`Étage ${floor}`}>
                    <FloorHeading
                      floor={floor}
                      meta={`${all.length} chambres · ${toClean} à nettoyer · ${count('on', all)} sans ménage`}
                    />
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                      {list.map((r) => (
                        <RoomTile
                          key={r.number}
                          room={r}
                          selected={panel === r.number}
                          pulseNote={pulse[r.number]}
                          syncTarget={store.syncingTarget(r.number)}
                          onOpen={() => setPanel(r.number)}
                          onForce={() => store.force(r.number)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })
            )}
            {store.ready && visible.length === 0 && <div className="py-12 text-center text-[15px] text-sg-ink-2">Aucune chambre dans cet état.</div>}
          </div>

          {config?.mode === 'demo' && <DemoBar compact={!!panelRoom || width < 1100} />}

          {toast && (
            <div
              role="alert"
              className="absolute left-1/2 top-4 z-[6] flex max-w-[min(640px,calc(100%-32px))] items-start gap-2.5 rounded-sg-md bg-sg-err-soft px-4 py-3 text-[14px] font-medium leading-[1.4] text-sg-err shadow-sg"
              style={{ animation: 'sgFadeIn .2s ease-out', transform: 'translateX(-50%)' }}
            >
              <AlertIcon size={18} />
              <span className="flex-1">{toast}</span>
              <button type="button" onClick={() => setToast(null)} aria-label="Fermer le message" className="flex-none border-0 bg-transparent p-0.5 text-current">
                <CloseIcon />
              </button>
            </div>
          )}
        </div>

        {panelRoom && (
          <>
            {!desktop && <div onClick={closePanel} className="absolute inset-0 z-[4]" style={{ background: 'var(--sg-scrim)' }} />}
            <RoomPanel room={panelRoom} overlay={!desktop} syncTarget={store.syncingTarget(panelRoom.number)} onClose={closePanel} />
          </>
        )}
      </div>
    </div>
  );
}

function Counter({ icon, title, value, sub, bordered }: { icon: ReactNode; title: string; value: number; sub: string; bordered?: boolean }) {
  return (
    <div className={`px-6 py-5 ${bordered ? 'border-t border-sg-line sm:border-l sm:border-t-0' : ''}`}>
      <div className="flex items-center gap-2.5 text-[15px] font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-3 font-display text-counter tabular-nums">{value}</div>
      <div className="mt-1.5 text-[14px] text-sg-ink-2">{sub}</div>
    </div>
  );
}
