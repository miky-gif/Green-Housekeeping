import { useEffect, useRef, useState } from 'react';
import { RoomCard, RoomDetailPanel, RoomTable } from '../components/rooms';
import { Button, Card, FilterChip, Overline, PageHeader, SearchField, Segmented, cx } from '../components/ui';
import { download } from '../lib/api';
import { frenchList } from '../lib/live';
import { setQuery, useQuery } from '../lib/nav';
import { useProgram } from '../lib/program';
import { useRemoteChanges, useStore } from '../lib/store';
import { displayState, type DisplayState, type Room } from '../lib/types';

type Filter = 'all' | 'on' | 'off' | 'inel';
const PULSE_MS = 3600;

/** Chambres — maquettes 2b (grille), 2c (liste), 2d (détail). */
export default function Rooms() {
  const store = useStore();
  const program = useProgram();
  const query = useQuery();
  const [search, setSearch] = useState('');
  const [pulse, setPulse] = useState<Record<number, boolean>>({});
  const timers = useRef<Record<number, number>>({});

  const view = query.get('vue') === 'liste' ? 'list' : 'grid';
  const filter = (query.get('filtre') as Filter) || 'all';
  const floorParam = query.get('etage');
  const open = query.get('chambre') ? Number(query.get('chambre')) : null;

  useEffect(() => {
    document.title = 'Chambres · GreenKeeping';
  }, []);
  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);

  useRemoteChanges(({ room }) => {
    const n = room.number;
    setPulse((p) => ({ ...p, [n]: true }));
    window.clearTimeout(timers.current[n]);
    timers.current[n] = window.setTimeout(() => setPulse((p) => ({ ...p, [n]: false })), PULSE_MS);
  });

  const rooms = store.list();
  const all = rooms.length;
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const count = (k: DisplayState) => rooms.filter((r) => displayState(r) === k).length;
  const total = program?.total_rooms ?? 424;
  const minNights = program?.min_nights ?? 2;
  const forceEnabled = program?.staff_force !== false;

  const visible = rooms.filter(
    (r) =>
      (filter === 'all' || displayState(r) === filter) &&
      (!floorParam || String(r.floor) === floorParam) &&
      (!search.trim() || String(r.number).includes(search.trim())),
  );
  const shownFloors = floors.filter((f) => visible.some((r) => r.floor === f));

  const filters: [Filter, string, number][] = [
    ['all', 'Toutes', all],
    ['on', 'Sans nettoyage', count('on')],
    ['off', 'Nettoyage normal', count('off')],
    ['inel', 'Non éligibles', count('inel')],
  ];

  return (
    <>
      <PageHeader
        title="Chambres"
        subtitle={`${all} chambres pilotes sur ${total} · étage${floors.length > 1 ? 's' : ''} ${frenchList(floors)}`}
        actions={
          <Button size="lg" icon="download" onClick={() => download('/api/export/rooms.csv')}>
            Exporter
          </Button>
        }
      />

      <Card className="flex flex-col gap-3.5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <SearchField value={search} onChange={setSearch} placeholder="N° de chambre…" onEnter={() => visible[0] && setQuery({ chambre: String(visible[0].number) }, false)} />
          <div role="tablist" aria-label="Filtrer par état" className="flex flex-wrap gap-2">
            {filters.map(([k, label, n]) => (
              <FilterChip key={k} active={filter === k} count={n} onClick={() => setQuery({ filtre: k === 'all' ? null : k })}>
                {label}
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto">
            <Segmented
              label="Affichage"
              tone="canvas"
              value={view}
              onChange={(v) => setQuery({ vue: v === 'list' ? 'liste' : null })}
              options={[
                { value: 'grid', label: 'Grille', icon: 'grid' },
                { value: 'list', label: 'Liste', icon: 'list' },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          <Overline className="mr-2">Étage</Overline>
          {[null, ...floors].map((f) => {
            const active = (f === null && !floorParam) || String(f) === floorParam;
            return (
              <button
                key={f ?? 'tous'}
                type="button"
                aria-pressed={active}
                onClick={() => setQuery({ etage: f === null ? null : String(f) })}
                className={cx(
                  'h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold tabular-nums',
                  active ? 'border-brand-200 bg-brand-100 text-ink-900' : 'border-transparent bg-transparent text-ink-700 hover:bg-canvas',
                )}
              >
                {f === null ? 'Tous' : f}
              </button>
            );
          })}
        </div>
      </Card>

      {shownFloors.length === 0 && <div className="py-12 text-center text-[14px] text-ink-500">Aucune chambre ne correspond à ces filtres.</div>}

      {shownFloors.map((floor) => {
        const list = visible.filter((r) => r.floor === floor);
        return (
          <section key={floor} className="mt-2 flex flex-col gap-3.5" aria-label={`Étage ${floor}`}>
            <div className="flex items-baseline gap-3">
              <h2 className="m-0 text-[20px] font-semibold text-ink-900">Étage {floor}</h2>
              <span className="text-[13px] text-ink-500">{floorSummary(rooms.filter((r) => r.floor === floor))}</span>
              <span className="h-px flex-1 self-center bg-line" />
            </div>
            {view === 'grid' ? (
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {list.map((r) => (
                  <RoomCard
                    key={r.number}
                    room={r}
                    pulse={pulse[r.number]}
                    syncing={store.syncingTarget(r.number) !== null}
                    forceEnabled={forceEnabled}
                    minNights={minNights}
                    onDetail={() => setQuery({ chambre: String(r.number) }, false)}
                  />
                ))}
              </div>
            ) : (
              <RoomTable
                rooms={list}
                syncing={(n) => store.syncingTarget(n) !== null}
                forceEnabled={forceEnabled}
                minNights={minNights}
                onDetail={(n) => setQuery({ chambre: String(n) }, false)}
              />
            )}
          </section>
        );
      })}

      {open !== null && store.room(open) && <RoomDetailPanel number={open} onClose={() => setQuery({ chambre: null })} />}
    </>
  );
}

/** « 3 chambres · 2 sans nettoyage · 1 non éligible » */
function floorSummary(rooms: Room[]): string {
  const c = (k: DisplayState) => rooms.filter((r) => displayState(r) === k).length;
  const parts = [`${rooms.length} chambre${rooms.length > 1 ? 's' : ''}`];
  if (c('on')) parts.push(`${c('on')} sans nettoyage`);
  if (c('off')) parts.push(`${c('off')} nettoyage normal`);
  if (c('inel')) parts.push(`${c('inel')} non éligible${c('inel') > 1 ? 's' : ''}`);
  if (c('free')) parts.push(`${c('free')} libre${c('free') > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
