import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icons';
import { Button, Card, cx, FilterChip, Overline, PageHeader, SearchField, Segmented, StatusBadge } from '../components/ui';
import { api, download } from '../lib/api';
import { authorLabel, dayHeader, eventTitle, hhmm } from '../lib/format';
import { useLiveResource } from '../lib/live';
import { navigate } from '../lib/nav';
import type { DisplayState, RoomEvent, Source } from '../lib/types';

const AUTHORS: { value: Source | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'guest', label: 'Client' },
  { value: 'staff', label: 'Gouvernante' },
  { value: 'system', label: 'Système' },
];

const AUTHOR_ICON: Record<Source, IconName> = { guest: 'user', staff: 'users', system: 'monitor' };

/** Historique — maquette 2e. */
export default function History() {
  const [days, setDays] = useState<'2' | '7' | '30'>('2');
  const [author, setAuthor] = useState<Source | 'all'>('all');
  const [room, setRoom] = useState('');
  const events = useLiveResource(() => api.events(Number(days)), [days]);

  useEffect(() => {
    document.title = 'Historique · GreenKeeping';
  }, []);

  const all = events.data ?? [];
  const by = (s: Source) => all.filter((e) => e.source === s).length;
  const shown = all.filter((e) => (author === 'all' || e.source === author) && (!room.trim() || String(e.room).includes(room.trim())));

  const groups: { day: string; items: RoomEvent[] }[] = [];
  for (const e of shown) {
    const key = new Date(e.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(e);
    else groups.push({ day: key, items: [e] });
  }

  return (
    <>
      <PageHeader
        title="Historique"
        subtitle="Chaque changement est horodaté et attribué : client, gouvernante ou système."
        actions={
          <Button size="lg" icon="download" onClick={() => download(`/api/export/events.csv?days=${Math.max(Number(days), 30)}`)}>
            Exporter en CSV
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <AuthorCard icon="user" title="Clients" sub="Changements depuis le bouton en chambre" value={by('guest')} />
        <AuthorCard icon="users" title="Gouvernante" sub="Forçages à distance" value={by('staff')} />
        <AuthorCard icon="monitor" title="Système" sub="Arrivées, départs et règles" value={by('system')} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SearchField value={room} onChange={setRoom} placeholder="N° de chambre…" width={240} />
          <Overline className="ml-1">Auteur</Overline>
          <div role="tablist" aria-label="Filtrer par auteur" className="flex flex-wrap gap-2">
            {AUTHORS.map((a) => (
              <FilterChip key={a.value} active={author === a.value} onClick={() => setAuthor(a.value)}>
                {a.label}
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Segmented
              label="Période"
              value={days}
              onChange={setDays}
              options={[
                { value: '2', label: '48 h' },
                { value: '7', label: '7 jours' },
                { value: '30', label: '30 jours' },
              ]}
            />
            <span className="whitespace-nowrap text-[13px] text-ink-500">
              {shown.length} événement{shown.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="bg-canvas">
                {['Heure', 'Chambre', 'Événement', 'État résultant', 'Auteur'].map((h) => (
                  <th key={h} className="border-y border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!events.data && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-ink-500">
                    Chargement…
                  </td>
                </tr>
              )}
              {events.data && shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-ink-500">
                    Aucun événement pour ces filtres.
                  </td>
                </tr>
              )}
              {groups.map((g) => [
                <tr key={`h${g.day}`}>
                  <td colSpan={5} className="border-b border-line px-5 py-3 text-[13px] font-semibold text-ink-900">
                    {dayHeader(g.items[0].created_at)}
                  </td>
                </tr>,
                ...g.items.map((e) => {
                  const ds: DisplayState = e.to_state === 'on' ? 'on' : e.eligible ? 'off' : e.actor.startsWith('départ') ? 'free' : 'inel';
                  return (
                    <tr key={e.id} className="border-b border-line">
                      <td className="px-5 py-3.5 text-[13px] tabular-nums text-ink-500">{hhmm(e.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/chambres?chambre=${e.room}`)}
                          className="cursor-pointer border-0 bg-transparent p-0 text-[14px] font-bold tabular-nums text-ink-900 hover:text-brand-600"
                        >
                          {e.room}
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-[14px] text-ink-900">{eventTitle(e)}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge state={ds} size="sm" />
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2.5 text-[14px] text-ink-900">
                          <span className={cx('grid h-7 w-7 place-items-center rounded-full bg-canvas text-ink-500')}>
                            <Icon name={AUTHOR_ICON[e.source]} size={14} />
                          </span>
                          {authorLabel(e)}
                        </span>
                      </td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function AuthorCard({ icon, title, sub, value }: { icon: IconName; title: string; sub: string; value: number }) {
  return (
    <Card as="div" className="flex items-center gap-4 p-6">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-[12px] bg-canvas text-ink-500">
        <Icon name={icon} size={19} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <Overline>{title}</Overline>
        <span className="text-[13px] leading-[1.45] text-ink-700">{sub}</span>
      </div>
      <span className="text-[32px] font-bold tabular-nums text-ink-900">{value}</span>
    </Card>
  );
}
