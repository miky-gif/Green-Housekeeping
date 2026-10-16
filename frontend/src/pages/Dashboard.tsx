import { useEffect, useState, type ReactNode } from 'react';
import BarChart from '../components/BarChart';
import { Icon, type IconName } from '../components/Icons';
import { ForceDialog } from '../components/rooms';
import { Button, Card, cx, Overline, PageHeader, SectionTitle, stateDot } from '../components/ui';
import { api, download } from '../lib/api';
import { activityLine, hhmm, weekdayShort } from '../lib/format';
import { frenchList, useLiveResource } from '../lib/live';
import { navigate } from '../lib/nav';
import { useStore } from '../lib/store';
import { displayState, type DisplayState, type RoomEvent } from '../lib/types';

/** Tableau de bord — maquette 2a. */
export default function Dashboard() {
  const store = useStore();
  const [forcing, setForcing] = useState(false);
  const rooms = store.list();
  const stats = useLiveResource(() => api.stats(7), []);
  const today = useLiveResource(() => api.events(1), []);

  useEffect(() => {
    document.title = 'Tableau de bord · GreenKeeping';
  }, []);

  const count = (k: DisplayState) => rooms.filter((r) => displayState(r) === k).length;
  const on = count('on');
  const eligible = rooms.filter((r) => r.stay && r.eligible).length;
  const onEligible = rooms.filter((r) => r.stay && r.eligible && r.state === 'on').length;
  const adoption = eligible ? Math.round((onEligible * 100) / eligible) : null;
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);

  const series = stats.data?.series ?? [];
  // La barre du jour suit l'état en direct, sans attendre le rechargement.
  const bars = series.map((d) => ({ key: d.date, label: weekdayShort(d.date), value: d.today ? onEligible : d.avoided, today: d.today }));
  const total = bars.reduce((s, b) => s + b.value, 0);
  const yesterday = series.length >= 2 ? series[series.length - 2].avoided : null;
  const delta = yesterday === null ? null : onEligible - yesterday;

  const todayKey = new Date().toDateString();
  const activity = (today.data ?? []).filter((e) => new Date(e.created_at).toDateString() === todayKey).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${rooms.length} chambres pilotes · étage${floors.length > 1 ? 's' : ''} ${frenchList(floors)}`}
        actions={
          <>
            <Button size="lg" icon="download" onClick={() => download('/api/export/rooms.csv')}>
              Exporter
            </Button>
            <Button size="lg" variant="primary" icon="power" onClick={() => setForcing(true)}>
              Forcer une chambre
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Sans nettoyage"
          value={on}
          icon="leaf"
          tone="ok"
          sub={
            delta === null ? (
              'aujourd’hui'
            ) : (
              <span className={cx('font-semibold', delta >= 0 ? 'text-ok-text' : 'text-ink-500')}>
                {delta === 0 ? 'comme hier' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} depuis hier`}
              </span>
            )
          }
        />
        <Kpi label="Nettoyage normal" value={count('off')} icon="sparkles" tone="info" sub={`sur ${eligible} séjour${eligible > 1 ? 's' : ''} éligible${eligible > 1 ? 's' : ''}`} />
        <Kpi label="Non éligibles" value={count('inel')} icon="ban" tone="mute" sub="séjours d’une nuit" />
        <Kpi
          label="Taux d’adoption"
          value={adoption === null ? '—' : `${adoption} %`}
          icon="trending"
          tone="brand"
          sub={`${onEligible} chambre${onEligible > 1 ? 's' : ''} sur ${eligible} éligible${eligible > 1 ? 's' : ''}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="flex flex-col gap-5 p-6">
          <SectionTitle
            right={
              <span className="text-[13px] text-ink-500">
                Total : <strong className="font-semibold text-ink-900">{total}</strong>
              </span>
            }
          >
            Nettoyages évités sur 7 jours
          </SectionTitle>
          {bars.length ? <BarChart bars={bars} height={240} /> : <div className="grid h-[240px] place-items-center text-[13px] text-ink-500">Chargement…</div>}
        </Card>

        <Card className="flex flex-col gap-2 p-6">
          <SectionTitle
            right={
              <button type="button" onClick={() => navigate('/dashboard/historique')} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand-600 hover:underline">
                Historique
              </button>
            }
          >
            Activité du jour
          </SectionTitle>
          <ActivityList events={activity} loading={!today.data} />
        </Card>
      </div>

      <ForceDialog open={forcing} onClose={() => setForcing(false)} />
    </>
  );
}

const TONES: Record<string, string> = {
  ok: 'bg-ok-bg text-ok-text',
  info: 'bg-info-bg text-info-text',
  mute: 'bg-mute-bg text-mute-text',
  brand: 'bg-brand-100 text-brand-600',
};

export function Kpi({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub: ReactNode; icon?: IconName; tone?: keyof typeof TONES }) {
  return (
    <Card as="div" className="flex flex-col gap-1.5 p-6">
      <div className="flex min-h-[24px] items-start justify-between gap-3">
        <Overline>{label}</Overline>
        {icon && tone && (
          <span className={cx('-mb-6 grid h-10 w-10 flex-none place-items-center rounded-[12px]', TONES[tone])}>
            <Icon name={icon} size={19} />
          </span>
        )}
      </div>
      <span className="text-[38px] font-bold leading-[1.1] tabular-nums text-ink-900">{value}</span>
      <span className="text-[12px] text-ink-500">{sub}</span>
    </Card>
  );
}

function ActivityList({ events, loading }: { events: RoomEvent[]; loading: boolean }) {
  if (loading) return <div className="py-6 text-[13px] text-ink-500">Chargement…</div>;
  if (!events.length) return <div className="py-6 text-[13px] text-ink-500">Aucun changement aujourd’hui pour l’instant.</div>;
  return (
    <ul className="m-0 list-none p-0">
      {events.map((e) => {
        const ds: DisplayState = e.to_state === 'on' ? 'on' : e.eligible ? 'off' : 'inel';
        return (
          <li key={e.id} className="border-t border-line">
            <button
              type="button"
              onClick={() => navigate(`/dashboard/chambres?chambre=${e.room}`)}
              className="grid w-full cursor-pointer grid-cols-[44px_10px_minmax(0,1fr)] items-start gap-3 border-0 bg-transparent py-3.5 text-left"
            >
              <span className="text-[12px] tabular-nums text-ink-500">{hhmm(e.created_at)}</span>
              <span className="mt-[7px] h-2 w-2 rounded-full" style={{ background: stateDot(ds) }} />
              <span className="text-[14px] leading-[1.45] text-ink-900">{activityLine(e)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
