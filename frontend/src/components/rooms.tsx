import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, qrSrc, roomUrl } from '../lib/api';
import { changeShort, dayMonth, journalSub, journalWhen, eventTitle, modifiedLine, nightsLabel, parseDay } from '../lib/format';
import { barShort, useProgram } from '../lib/program';
import { store, useStore } from '../lib/store';
import { displayState, type ButtonValue, type DisplayState, type Room, type RoomDetail } from '../lib/types';
import { Icon, Spinner, type IconName } from './Icons';
import { Button, cx, IconButton, Modal, Overline, StatusBadge, stateDot, Toggle } from './ui';

export const shortStayLabel = (minNights: number) =>
  minNights <= 2 ? 'Séjour d’une nuit — option fermée' : `Séjour de moins de ${nightsLabel(minNights)} — option fermée`;

function InfoLine({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-ink-300">
      <Icon name={icon} size={15} className="mt-0.5" />
      <span className="text-ink-700">{children}</span>
    </div>
  );
}

function drinkLine(r: Room, bar: string) {
  if (!r.voucher) return `Boisson offerte · en attente du client`;
  if (r.voucher.status === 'remis') return `Boisson retirée au ${bar}`;
  if (r.voucher.status === 'annule') return 'Boisson annulée';
  return 'Boisson offerte · à retirer';
}

/** Carte de chambre (vue grille) — maquette 2b. */
export function RoomCard({
  room: r,
  pulse,
  syncing,
  forceEnabled,
  minNights,
  onDetail,
}: {
  room: Room;
  pulse?: boolean;
  syncing: boolean;
  forceEnabled: boolean;
  minNights: number;
  onDetail: () => void;
}) {
  const st = displayState(r);
  const program = useProgram();
  const [menu, setMenu] = useState(false);
  const canForce = forceEnabled && r.eligible && !!r.stay;
  return (
    <div
      data-room={r.number}
      data-state={st}
      className="relative box-border flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-shadow"
      style={{ animation: pulse ? 'gkPulse 1.2s ease-out 3' : undefined }}
    >
      <div className="flex items-center justify-between">
        <StatusBadge state={st} />
        <div className="relative">
          <IconButton icon="more" label={`Plus d'actions pour la chambre ${r.number}`} className="h-8 w-8" onClick={() => setMenu((m) => !m)} />
          {menu && <CardMenu number={r.number} onClose={() => setMenu(false)} />}
        </div>
      </div>
      <div>
        <div className="text-[24px] font-bold leading-[1.2] tabular-nums text-ink-900">{r.number}</div>
        <div className="mt-0.5 text-[13px] text-ink-500">{r.room_type}</div>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Fact label="Étage" value={r.floor} />
        <Fact label="Séjour" value={r.stay ? nightsLabel(r.stay.nights) : '—'} />
      </div>
      <div className="flex flex-col gap-2 rounded-btn bg-canvas p-3 text-[13px] leading-[1.4]">
        {st === 'inel' ? (
          <>
            <InfoLine icon="lock">{shortStayLabel(minNights)}</InfoLine>
            <InfoLine icon="sparkles">Nettoyage quotidien</InfoLine>
          </>
        ) : st === 'free' ? (
          <>
            <InfoLine icon="door">Chambre libre — aucun séjour</InfoLine>
            <InfoLine icon="key">Prête pour une arrivée</InfoLine>
          </>
        ) : (
          <>
            <InfoLine icon="clock">{modifiedLine(r)}</InfoLine>
            {st === 'on' ? <InfoLine icon="wine">{drinkLine(r, barShort(program))}</InfoLine> : <InfoLine icon="sparkles">Nettoyage prévu aujourd’hui</InfoLine>}
          </>
        )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2.5">
        <Button
          variant="primary"
          icon={syncing ? undefined : 'power'}
          busy={syncing}
          disabled={!canForce}
          title={canForce ? (r.state === 'on' ? 'Rétablir le nettoyage' : 'Forcer sans nettoyage') : undefined}
          onClick={() => store.force(r.number)}
        >
          {syncing ? 'Envoi…' : 'Forcer'}
        </Button>
        <Button onClick={onDetail}>Détail</Button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Overline>{label}</Overline>
      <span className="text-[14px] font-semibold tabular-nums text-ink-900">{value}</span>
    </div>
  );
}

function CardMenu({ number, onClose }: { number: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const item = 'flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3.5 py-2.5 text-left text-[13px] text-ink-700 no-underline hover:bg-canvas';
  return (
    <div ref={ref} className="absolute right-0 top-[calc(100%+4px)] z-20 w-[230px] overflow-hidden rounded-[12px] border border-line bg-surface shadow-pop">
      <a className={item} href={roomUrl(number)} target="_blank" rel="noopener" onClick={onClose}>
        <Icon name="external" size={15} className="text-ink-500" /> Ouvrir l’écran en chambre
      </a>
      <button
        type="button"
        className={item}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(roomUrl(number));
            setCopied(true);
            window.setTimeout(onClose, 900);
          } catch {
            onClose();
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={15} className="text-ink-500" /> {copied ? 'Lien copié' : 'Copier le lien de l’écran'}
      </button>
    </div>
  );
}

/** Tableau d'un étage (vue liste) — maquette 2c. */
export function RoomTable({ rooms, syncing, forceEnabled, minNights, onDetail }: { rooms: Room[]; syncing: (n: number) => boolean; forceEnabled: boolean; minNights: number; onDetail: (n: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="bg-canvas">
            {['Chambre', 'Séjour', 'État', 'Dernier changement', 'Pas de nettoyage', ''].map((h) => (
              <th key={h} className="border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => {
            const st = displayState(r);
            const canForce = forceEnabled && r.eligible && !!r.stay;
            return (
              <tr key={r.number} className="border-b border-line last:border-b-0">
                <td className="px-5 py-3">
                  <div className="text-[15px] font-bold tabular-nums text-ink-900">{r.number}</div>
                  <div className="text-[13px] text-ink-500">{r.room_type}</div>
                </td>
                <td className="px-5 py-3 text-[14px] font-semibold text-ink-900">{r.stay ? nightsLabel(r.stay.nights) : '—'}</td>
                <td className="px-5 py-3">
                  <StatusBadge state={st} />
                </td>
                <td className="px-5 py-3 text-[13px] text-ink-700">
                  {st === 'inel' ? shortStayLabel(minNights) : st === 'free' ? 'Chambre libre' : changeShort(r)}
                </td>
                <td className="px-5 py-3">
                  <Toggle
                    checked={r.state === 'on'}
                    disabled={!canForce}
                    busy={syncing(r.number)}
                    label={`Chambre ${r.number} : pas de nettoyage`}
                    onChange={(v) => store.force(r.number, v ? 'on' : 'off')}
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <Button size="sm" onClick={() => onDetail(r.number)}>
                    Détail
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Panneau de détail d'une chambre (460 px) — maquette 2d, enrichi pour la production. */
export function RoomDetailPanel({ number, onClose }: { number: number; onClose: () => void }) {
  const store = useStore();
  const program = useProgram();
  const r = store.room(number);
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const syncing = store.syncingTarget(number) !== null;

  useEffect(() => {
    let alive = true;
    api.room(number).then(
      (d) => alive && setDetail(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [number, r?.rev, r?.stay?.id, r?.stay?.nights, r?.voucher?.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!r) return null;
  const st = displayState(r);
  const minNights = program?.min_nights ?? 2;
  const forceEnabled = program?.staff_force !== false;
  const canForce = forceEnabled && r.eligible && !!r.stay;
  const voucher = detail?.vouchers.find((v) => v.stay_id === r.stay?.id) ?? null;
  const bar = barShort(program);

  return (
    <div className="gk-no-print fixed inset-0 z-40" onClick={onClose} style={{ background: 'var(--scrim)' }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Détail de la chambre ${number}`}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 right-0 top-0 flex w-[min(460px,100vw)] flex-col overflow-auto border-l border-line bg-surface"
        style={{ animation: 'gkSlide .18s ease-out', boxShadow: '-24px 0 48px rgba(26,24,20,.16)' }}
      >
        <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-8">
          <div>
            <Overline>Chambre</Overline>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[30px] font-bold leading-none tabular-nums text-ink-900">{r.number}</span>
              <StatusBadge state={st} />
            </div>
            <div className="mt-2 text-[13px] text-ink-500">
              {r.room_type} · Étage {r.floor}
            </div>
          </div>
          <button type="button" aria-label="Fermer le détail" onClick={onClose} className="grid h-10 w-10 cursor-pointer place-items-center rounded-btn border border-line bg-surface text-ink-700 hover:bg-canvas">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-7 px-8 pb-10">
          <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Overline>Forçage à distance</Overline>
                <div className="mt-1 text-[16px] font-bold text-ink-900">{r.state === 'on' ? 'Pas de nettoyage' : 'Nettoyage normal'}</div>
              </div>
              <Toggle
                checked={r.state === 'on'}
                disabled={!canForce}
                busy={syncing}
                label={`Forcer la chambre ${r.number} : pas de nettoyage`}
                onChange={(v) => store.force(r.number, v ? 'on' : 'off')}
              />
            </div>
            <p className="m-0 mt-3 text-[13px] leading-[1.5] text-ink-700">
              {!r.stay
                ? 'Chambre libre : le bouton du client est inactif jusqu’à la prochaine arrivée.'
                : !r.eligible
                  ? `${shortStayLabel(minNights)}. La chambre est faite chaque jour.`
                  : !forceEnabled
                    ? 'Le forçage à distance est désactivé dans les paramètres.'
                    : r.state === 'on'
                      ? `Bouton allumé : la chambre ne sera pas faite aujourd’hui. Une boisson est offerte au ${bar}.`
                      : 'Bouton éteint : la chambre sera faite aujourd’hui. Le client peut encore renoncer depuis sa chambre.'}
            </p>
            {syncing && (
              <div className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-warn-text">
                <Spinner size={11} /> Envoi au bouton de la chambre…
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FactBox icon="arrive" label="Arrivée" value={r.stay ? dayMonth(parseDay(r.stay.check_in)) : '—'} />
            <FactBox icon="depart" label="Départ" value={r.stay ? dayMonth(parseDay(r.stay.check_out)) : '—'} />
            <FactBox icon="moon" label="Nuits" value={r.stay ? r.stay.nights : '—'} />
            <FactBox icon="bed" label="Type" value={r.room_type} />
          </div>

          <StayActions room={r} />

          {r.stay && r.eligible && (
            <section className="flex flex-col gap-3">
              <h3 className="m-0 text-[18px] font-semibold text-ink-900">Boisson offerte</h3>
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line p-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-btn bg-canvas text-ink-500">
                    <Icon name="wine" size={17} />
                  </span>
                  <div className="leading-[1.4]">
                    <div className="text-[14px] font-semibold text-ink-900">{voucher ? (voucher.status === 'remis' ? 'Retirée au bar' : 'À retirer au bar') : 'Pas encore émise'}</div>
                    <div className="text-[12px] text-ink-500">
                      {voucher ? `${voucher.code} · ${program?.drink_pickup ?? 'Sur présentation du numéro de chambre'}` : 'Émise quand le client allume lui-même son bouton.'}
                    </div>
                  </div>
                </div>
                {voucher && voucher.status === 'emis' && (
                  <Button size="sm" onClick={() => api.voucher(voucher.id, 'remis').catch(() => undefined)}>
                    Marquer remise
                  </Button>
                )}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-[18px] font-semibold text-ink-900">Journal</h3>
            {!detail ? (
              <div className="flex items-center gap-2 text-[13px] text-ink-500">
                <Spinner size={12} /> Chargement…
              </div>
            ) : detail.events.length === 0 ? (
              <div className="text-[13px] text-ink-500">Aucun changement enregistré.</div>
            ) : (
              <ol className="m-0 flex list-none flex-col p-0">
                {detail.events.map((e, i) => {
                  const ds: DisplayState = e.to_state === 'on' ? 'on' : e.eligible ? 'off' : 'inel';
                  return (
                    <li key={e.id} className="relative flex gap-3 pb-4">
                      {i < detail.events.length - 1 && <span className="absolute bottom-0 left-[4px] top-4 w-px bg-line" />}
                      <span className="mt-[7px] h-[9px] w-[9px] flex-none rounded-full" style={{ background: stateDot(ds) }} />
                      <div className="leading-[1.45]">
                        <div className="text-[12px] tabular-nums text-ink-500">{journalWhen(e.created_at)}</div>
                        <div className="text-[14px] font-medium text-ink-900">{eventTitle(e)}</div>
                        <div className="text-[12px] text-ink-500">{journalSub(e)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="m-0 text-[18px] font-semibold text-ink-900">Écran en chambre</h3>
            <div className="flex items-center gap-4 rounded-[12px] border border-line p-3.5">
              <img src={qrSrc(roomUrl(r.number))} alt={`QR code de l'écran de la chambre ${r.number}`} width={84} height={84} className="flex-none rounded-[8px] bg-white p-1" />
              <div className="flex min-w-0 flex-col gap-1.5 text-[13px] leading-[1.45] text-ink-700">
                <span>Scannez avec la tablette ou le téléphone installé dans la chambre.</span>
                <a href={roomUrl(r.number)} target="_blank" rel="noopener" className="flex items-center gap-1.5 self-start font-semibold text-brand-600 no-underline hover:underline">
                  Ouvrir l’écran <Icon name="external" size={14} />
                </a>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function FactBox({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-line p-3.5">
      <Icon name={icon} size={16} className="mt-0.5 text-ink-300" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Overline>{label}</Overline>
        <span className="truncate text-[14px] font-semibold tabular-nums text-ink-900">{value}</span>
      </div>
    </div>
  );
}

/** Séjour : saisie réception en attendant la connexion au PMS. */
function StayActions({ room: r }: { room: Room }) {
  const [mode, setMode] = useState<null | 'edit' | 'out' | 'in'>(null);
  const [nights, setNights] = useState(r.stay?.nights ?? 2);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNights(r.stay?.nights ?? 2);
    setMode(null);
  }, [r.stay?.id, r.stay?.nights]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    setMode(null);
  };

  const stepper = (
    <div className="inline-flex items-center overflow-hidden rounded-btn border border-line" role="group" aria-label="Durée du séjour">
      <button type="button" aria-label="Une nuit de moins" disabled={nights <= 1} onClick={() => setNights(nights - 1)} className="grid h-10 w-10 cursor-pointer place-items-center border-0 bg-surface text-ink-700 disabled:opacity-40">
        <Icon name="minus" size={16} />
      </button>
      <span className="min-w-[84px] border-x border-line text-center text-[14px] font-semibold tabular-nums text-ink-900" aria-live="polite">
        {nightsLabel(nights)}
      </span>
      <button type="button" aria-label="Une nuit de plus" disabled={nights >= 30} onClick={() => setNights(nights + 1)} className="grid h-10 w-10 cursor-pointer place-items-center border-0 bg-surface text-ink-700 disabled:opacity-40">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[18px] font-semibold text-ink-900">Séjour</h3>
        <span className="text-[12px] text-ink-500">Saisie manuelle, en attendant le PMS</span>
      </div>
      {!r.stay ? (
        <div className="flex flex-wrap items-center gap-3">
          {stepper}
          <Button variant="primary" icon="key" busy={busy} onClick={() => run(() => store.setStay(r.number, nights))}>
            Enregistrer l’arrivée
          </Button>
        </div>
      ) : mode === 'edit' ? (
        <div className="flex flex-wrap items-center gap-3">
          {stepper}
          <Button variant="primary" busy={busy} disabled={nights === r.stay.nights} onClick={() => run(() => store.setStay(r.number, nights))}>
            Enregistrer
          </Button>
          <Button variant="ghost" onClick={() => setMode(null)}>
            Annuler
          </Button>
        </div>
      ) : mode === 'out' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] bg-canvas p-3 text-[13px]">
          <span className="mr-auto font-medium text-ink-900">Confirmer le départ de la chambre {r.number} ?</span>
          <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
            Annuler
          </Button>
          <Button size="sm" variant="primary" busy={busy} onClick={() => run(() => store.endStay(r.number))}>
            Confirmer le départ
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <Button size="sm" icon="moon" onClick={() => setMode('edit')}>
            Modifier la durée
          </Button>
          <Button size="sm" icon="depart" onClick={() => setMode('out')}>
            Enregistrer le départ
          </Button>
        </div>
      )}
    </section>
  );
}

/** « Forcer une chambre » depuis le Tableau de bord. */
export function ForceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const program = useProgram();
  const rooms = store.list().filter((r) => r.stay && r.eligible);
  const [number, setNumber] = useState<number | null>(null);
  const [target, setTarget] = useState<ButtonValue>('on');
  useEffect(() => {
    if (open) {
      setNumber(rooms[0]?.number ?? null);
      setTarget('on');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const forceEnabled = program?.staff_force !== false;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Forcer une chambre"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            icon="power"
            disabled={!number || !forceEnabled}
            onClick={() => {
              if (number) store.force(number, target);
              onClose();
            }}
          >
            Appliquer
          </Button>
        </>
      }
    >
      {!forceEnabled ? (
        <p className="m-0 text-[14px] text-ink-700">Le forçage à distance est désactivé dans les paramètres.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Overline>Chambre</Overline>
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <button
                  key={r.number}
                  type="button"
                  aria-pressed={number === r.number}
                  onClick={() => setNumber(r.number)}
                  className={cx(
                    'flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold tabular-nums',
                    number === r.number ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-surface text-ink-700',
                  )}
                >
                  {r.number}
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: number === r.number ? '#fff' : stateDot(displayState(r)) }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Overline>Nouvel état</Overline>
            <div className="grid grid-cols-2 gap-2.5">
              {(['on', 'off'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={target === v}
                  onClick={() => setTarget(v)}
                  className={cx(
                    'flex cursor-pointer flex-col items-start gap-1 rounded-[12px] border p-3.5 text-left',
                    target === v ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface',
                  )}
                >
                  <StatusBadge state={v === 'on' ? 'on' : 'off'} />
                  <span className="text-[13px] text-ink-700">{v === 'on' ? 'La chambre ne sera pas faite aujourd’hui.' : 'La chambre sera faite aujourd’hui.'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
