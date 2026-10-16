import { useEffect, useState, type ReactNode } from 'react';
import BarChart from '../components/BarChart';
import { Icon } from '../components/Icons';
import { Button, Card, PageHeader, SectionTitle, Segmented } from '../components/ui';
import { api, download } from '../lib/api';
import { dayHeader, weekdayShort, parseDay } from '../lib/format';
import { useLiveResource } from '../lib/live';
import { navigate } from '../lib/nav';
import { barName, useProgram } from '../lib/program';
import { useStore } from '../lib/store';
import { Kpi } from './Dashboard';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const fr = (n: number, digits = 1) => n.toLocaleString('fr-BE', { maximumFractionDigits: digits });

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - start.getTime()) / 86_400_000 + 1) / 7);
}

/** Rapports — maquette 2f. « Exporter en PDF » imprime la page (mise en page dédiée). */
export default function Reports() {
  const [days, setDays] = useState<'7' | '30'>('7');
  const store = useStore();
  const program = useProgram();
  const stats = useLiveResource(() => api.stats(Number(days)), [days]);
  const s = stats.data;
  const rooms = store.list();
  const now = new Date();

  useEffect(() => {
    document.title = 'Rapports · GreenKeeping';
  }, []);

  const bars = (s?.series ?? []).map((d) => ({
    key: d.date,
    label: days === '7' ? weekdayShort(d.date) : String(parseDay(d.date).getDate()),
    value: d.avoided,
    today: d.today,
  }));
  const canMonth = (s?.history_days ?? 0) >= 30;
  const hotel = store.config?.hotel_name ?? 'The Hotel Brussels';

  return (
    <>
      <div className="hidden print:block">
        <div className="text-[12px] text-ink-500">GreenKeeping · {hotel}</div>
        <div className="text-[12px] text-ink-500">Édité le {dayHeader(now).replace('Aujourd’hui · ', '')}</div>
      </div>
      <PageHeader
        title="Rapports"
        subtitle={`Programme pilote · ${rooms.length} chambres · données des ${days} derniers jours`}
        actions={
          <div className="gk-no-print flex items-center gap-3">
            <Segmented
              label="Période"
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: '7 jours' },
                { value: '30', label: '30 jours', disabled: !canMonth, title: canMonth ? undefined : 'Disponible après 30 jours de pilote' },
              ]}
            />
            <Button size="lg" variant="primary" icon="download" onClick={() => window.print()}>
              Exporter en PDF
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Nettoyages évités" value={s ? s.total_avoided : '—'} sub={`sur les ${days} derniers jours`} />
        <Kpi label="Moyenne par jour" value={s ? fr(s.avg_per_day) : '—'} sub="nettoyages évités" />
        <Kpi label="Taux d’adoption" value={s?.adoption != null ? `${s.adoption} %` : '—'} sub={s ? `${s.on_eligible} chambres sur ${s.eligible} éligibles` : ''} />
        <Kpi label="Boissons à retirer" value={s ? s.drinks_to_collect : '—'} sub={`au bar ${barName(program)}, aujourd’hui`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="flex flex-col gap-5 p-6">
          <SectionTitle
            right={
              s && (
                <span className="flex items-center gap-2 text-[13px] text-ink-500">
                  <span aria-hidden className="w-5 border-t-2 border-dashed border-ink-500" />
                  moyenne <strong className="font-semibold text-ink-900">{fr(s.avg_per_day)}</strong>
                </span>
              )
            }
          >
            Nettoyages évités par jour
          </SectionTitle>
          {s ? <BarChart bars={bars} height={230} average={s.avg_per_day} /> : <div className="grid h-[230px] place-items-center text-[13px] text-ink-500">Chargement…</div>}
        </Card>
        <Card className="flex flex-col gap-5 p-6">
          <SectionTitle sub="Chambres sans nettoyage / séjours éligibles, aujourd'hui">Adoption par étage</SectionTitle>
          {(s?.floors ?? []).map((f) => {
            const pct = f.eligible ? Math.round((f.on * 100) / f.eligible) : 0;
            return (
              <div key={f.floor} className="flex flex-col gap-2">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold text-ink-900">Étage {f.floor}</span>
                  <span className="tabular-nums text-ink-500">
                    {f.on} / {f.eligible} · <strong className="font-semibold text-ink-900">{f.eligible ? `${pct} %` : '—'}</strong>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Adoption étage ${f.floor}`}>
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="flex items-start gap-4 rounded-card border border-brand-200 bg-brand-50 p-6">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-surface text-brand-600">
            <Icon name="droplet" size={19} />
          </span>
          <div className="flex flex-1 flex-col gap-2">
            <h2 className="m-0 text-[20px] font-semibold text-ink-900">Impact environnemental</h2>
            {s?.impact ? (
              <>
                <p className="m-0 text-[14px] leading-[1.6] text-ink-700">
                  Estimation pour les {s.total_avoided} nettoyages évités, à partir des ratios fournis par l’équipe technique.
                </p>
                <div className="mt-1 grid grid-cols-3 gap-3">
                  <ImpactValue label="Eau" value={s.impact.water_l} unit="L" />
                  <ImpactValue label="Énergie" value={s.impact.energy_kwh} unit="kWh" />
                  <ImpactValue label="Produits" value={s.impact.products_ml === null ? null : s.impact.products_ml / 1000} unit="L" />
                </div>
              </>
            ) : (
              <p className="m-0 text-[14px] leading-[1.6] text-ink-700">
                Renseignez les ratios eau, énergie et produits par nettoyage pour estimer l’impact des {s?.total_avoided ?? '…'} nettoyages évités. Aucune estimation n’est affichée tant qu’ils ne sont pas définis.
              </p>
            )}
            <Button className="gk-no-print mt-1 self-start" onClick={() => navigate('/dashboard/parametres#ratios')}>
              {s?.impact ? 'Modifier les ratios' : 'Configurer les ratios'}
            </Button>
          </div>
        </section>
        <Card className="flex flex-col gap-4 p-6">
          <SectionTitle>Certifications</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(program?.certifications ?? []).map((c) => (
              <div key={c} className="flex items-center gap-3 rounded-[12px] border border-line p-3.5">
                <span className="text-ok-text">
                  <Icon name={c.toLowerCase().includes('key') ? 'award' : 'building'} size={22} />
                </span>
                <div className="flex flex-col leading-[1.4]">
                  <span className="text-[14px] font-semibold text-ink-900">{c}</span>
                  <span className="text-[13px] text-ink-500">Certifié</span>
                </div>
              </div>
            ))}
          </div>
          <span className="text-[13px] text-ink-500">
            {hotel}
            {program?.hotel_address ? ` · ${program.hotel_address}` : ''}
          </span>
        </Card>
      </div>

      <Card className="gk-no-print overflow-hidden">
        <div className="border-b border-line px-6 py-5">
          <h2 className="m-0 text-[20px] font-semibold text-ink-900">Documents</h2>
        </div>
        <DocRow title={`Bilan Green Key — ${MONTHS[now.getMonth()]} ${now.getFullYear()}`} sub="Rapport mensuel pour l’audit de certification" status="En préparation">
          <Button size="sm" icon="download" disabled title="Disponible à la fin du mois">
            PDF
          </Button>
        </DocRow>
        <DocRow title={`Rapport hebdomadaire — semaine ${isoWeek(now)}`} sub="Nettoyages évités, adoption, forçages" status="Prêt">
          <Button
            size="sm"
            icon="download"
            onClick={() => {
              setDays('7');
              window.setTimeout(() => window.print(), 400);
            }}
          >
            PDF
          </Button>
          <Button size="sm" icon="download" onClick={() => download('/api/export/daily.csv?days=7')}>
            CSV
          </Button>
        </DocRow>
        <DocRow title="Journal des changements" sub="Export complet horodaté et attribué" status="Prêt" last>
          <Button size="sm" icon="download" onClick={() => download('/api/export/events.csv?days=30')}>
            CSV
          </Button>
        </DocRow>
      </Card>
    </>
  );
}

function ImpactValue({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="rounded-[12px] bg-surface px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">{label}</div>
      <div className="text-[18px] font-bold tabular-nums text-ink-900">{value === null ? '—' : `${fr(value)} ${unit}`}</div>
    </div>
  );
}

function DocRow({ title, sub, status, children, last }: { title: string; sub: string; status: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 px-6 py-4 ${last ? '' : 'border-b border-line'}`}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-btn bg-canvas text-ink-500">
        <Icon name="file" size={18} />
      </span>
      <div className="flex min-w-[200px] flex-1 flex-col leading-[1.4]">
        <span className="text-[14px] font-semibold text-ink-900">{title}</span>
        <span className="text-[13px] text-ink-500">{sub}</span>
      </div>
      <span className="min-w-[110px] text-[13px] font-semibold text-ink-700">{status}</span>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
