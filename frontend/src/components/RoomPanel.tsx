import { useEffect, useState, type ReactNode } from 'react';
import { api, qrSrc, roomUrl } from '../lib/api';
import { byLabel, DateLabel, dayLabel, eventSub, hhmm, nightsLabel, parseDay, stayStatus, whenLabel } from '../lib/format';
import { store } from '../lib/store';
import { displayState, type ButtonValue, type Room, type RoomDetail, type RoomEvent } from '../lib/types';
import { DoorPlate, ExternalIcon, KeyIcon } from './Hotel';
import { CheckIcon, CloseIcon, DoorIcon, LockIcon, Spinner, StateIcon } from './Icons';

interface Props {
  room: Room;
  overlay: boolean;
  syncTarget: ButtonValue | null;
  onClose: () => void;
}

const PANEL_LABEL = {
  on: "Pas de nettoyage aujourd'hui",
  off: 'Nettoyage normal',
  inel: 'Non éligible · nettoyage normal',
  free: 'Chambre libre · aucun séjour',
} as const;

const overline = 'font-mono text-overline uppercase text-sg-ink-3';

/** Panneau chambre : état, séjour, forçage, appairage, vouchers, historique. */
export default function RoomPanel({ room: r, overlay, syncTarget, onClose }: Props) {
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const st = displayState(r);
  const on = st === 'on';

  // Recharge l'historique à chaque nouvelle révision de la chambre.
  useEffect(() => {
    let alive = true;
    api.room(r.number).then(
      (d) => alive && setDetail(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [r.number, r.rev, r.stay?.id, r.stay?.nights]);

  const events = detail?.room.number === r.number ? detail.events : null;
  const vouchers = detail?.room.number === r.number ? detail.vouchers : [];

  const choice = (target: ButtonValue) => {
    const active = r.state === target;
    const isOn = target === 'on';
    return (
      <button
        type="button"
        onClick={() => store.force(r.number, target)}
        aria-pressed={active}
        className="box-border flex min-h-[68px] cursor-pointer flex-col gap-[3px] rounded-sg-md px-3.5 py-3 text-left"
        style={{
          border: `1.5px solid ${active ? (isOn ? 'var(--sg-on)' : 'var(--sg-ink)') : 'var(--sg-line-strong)'}`,
          background: active ? (isOn ? 'var(--sg-on)' : 'var(--sg-ink)') : 'transparent',
          color: active ? (isOn ? 'var(--sg-on-fg)' : 'var(--sg-bg)') : 'var(--sg-ink)',
        }}
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {isOn ? (
            <CheckIcon size={16} strokeWidth={3} />
          ) : (
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
              <circle cx="12" cy="12" r="8" />
            </svg>
          )}
          {isOn ? 'Allumer' : 'Éteindre'}
        </span>
        <span className="text-[13px]">{isOn ? 'Pas de nettoyage' : 'Nettoyage normal'}</span>
      </button>
    );
  };

  return (
    <aside
      aria-label={`Détail de la chambre ${r.number}`}
      className="top-0 bottom-0 right-0 z-[5] box-border flex flex-none flex-col border-l border-sg-line bg-sg-surface"
      style={{
        position: overlay ? 'absolute' : 'relative',
        width: overlay ? 'min(460px, 100vw)' : 420,
        boxShadow: overlay ? '-24px 0 48px rgba(0,0,0,.18)' : 'none',
      }}
    >
      <div className="flex flex-none items-start justify-between gap-4 border-b border-sg-line px-7 pb-5 pt-6">
        <div className="flex items-center gap-4">
          <DoorPlate number={r.number} size="lg" />
          <div className="font-mono text-overline uppercase leading-relaxed text-sg-ink-3">
            {r.floor}e étage
            {r.is_suite && (
              <>
                <br />
                <span className="text-brass-ink">Suite</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-sg-line-strong bg-transparent px-3.5 text-[14px] font-medium text-sg-ink"
        >
          Fermer
          <CloseIcon />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-7 overflow-auto px-7 pb-8 pt-6">
        <div className="flex items-center gap-3.5">
          <StateIcon state={st} size={34} />
          <div>
            <div className="text-[22px] font-semibold leading-[1.2]" style={{ color: on ? 'var(--sg-on-ink)' : 'var(--sg-ink)' }}>
              {PANEL_LABEL[st]}
            </div>
            <div className="mt-[3px] text-[14px] text-sg-ink-2">
              Depuis <span className="font-mono text-[13px]">{whenLabel(r.updated_at)}</span> · {byLabel(r)}
            </div>
          </div>
        </div>

        <StaySection key={`${r.number}-${r.stay?.id ?? 'libre'}-${r.stay?.nights ?? 0}`} room={r} />

        <section className="flex flex-col gap-3">
          <div className={overline}>Forçage à distance</div>
          <div className="grid grid-cols-2 gap-2">
            {choice('on')}
            {choice('off')}
          </div>
          {syncTarget && (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-sg-warn">
              <Spinner size={12} />
              Synchronisation avec le bouton de la chambre…
            </div>
          )}
          {r.eligible ? (
            <div className="text-[13px] leading-[1.4] text-sg-ink-2">Le client peut encore modifier son bouton après un forçage.</div>
          ) : (
            <Note icon={<LockIcon size={16} strokeWidth={2.4} className="mt-0.5" />}>
              {r.stay
                ? "Séjour d'1 nuit : le client ne peut pas actionner son bouton. Le forçage gouvernante reste possible."
                : 'Chambre libre : le bouton du client est inactif jusqu’à la prochaine arrivée.'}
            </Note>
          )}
        </section>

        <PairingSection number={r.number} />

        <section className="flex flex-col">
          <div className={`${overline} mb-1.5`}>Voucher boisson 5 €</div>
          {!r.voucher && <VoucherRow d="Aujourd'hui" {...pendingVoucher(r)} />}
          {vouchers.map((v) => (
            <VoucherRow
              key={v.id}
              d={dayLabel(v.issued_at)}
              s={`Code ${v.code} · ${v.status === 'remis' ? 'remis au bar' : 'à retirer au bar'}`}
              chip={v.status === 'remis' ? 'Remis' : v.status === 'annule' ? 'Annulé' : 'Émis'}
            />
          ))}
        </section>

        <section className="flex flex-col">
          <div className={`${overline} mb-1.5`}>Historique des changements</div>
          {events === null ? (
            <div className="flex items-center gap-2 border-t border-sg-line py-3 text-[14px] text-sg-ink-2">
              <Spinner size={12} /> Chargement…
            </div>
          ) : events.length === 0 ? (
            <div className="border-t border-sg-line py-3 text-[14px] text-sg-ink-2">Aucun changement enregistré.</div>
          ) : (
            events.map((e) => <HistoryRow key={e.id} e={e} />)
          )}
        </section>
      </div>
    </aside>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-sg-md border-[1.5px] border-dashed border-sg-line-strong bg-sg-surface-2 px-4 py-3.5 text-[14px] leading-[1.45] text-sg-ink-2">
      {icon}
      <span>{children}</span>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const btn = 'grid h-10 w-10 cursor-pointer place-items-center border-0 bg-transparent text-[20px] text-sg-ink disabled:cursor-not-allowed disabled:opacity-35';
  return (
    <div className="inline-flex items-center rounded-sg-md border border-sg-line-strong" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Une nuit de moins">
        −
      </button>
      <span className="min-w-[78px] text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
        {nightsLabel(value)}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= 30} aria-label="Une nuit de plus">
        +
      </button>
    </div>
  );
}

/** Séjour : saisie réception en attendant la connexion au PMS. */
function StaySection({ room: r }: { room: Room }) {
  const [nights, setNights] = useState(r.stay?.nights ?? 2);
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = r.stay ? stayStatus(r.stay) : null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    setConfirmOut(false);
  };

  const primary = 'flex h-10 cursor-pointer items-center gap-2 rounded-sg-md border-0 bg-sg-ink px-4 text-[14px] font-semibold text-sg-bg disabled:opacity-50';
  const secondary = 'flex h-10 cursor-pointer items-center gap-2 rounded-sg-md border border-sg-line-strong bg-transparent px-4 text-[14px] font-medium text-sg-ink disabled:opacity-50';

  return (
    <section className="flex flex-col gap-3">
      <div className={overline}>Séjour</div>
      {r.stay ? (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 rounded-sg-md bg-sg-bg px-[18px] py-4 text-[15px]">
            <div className="text-sg-ink-2">Statut</div>
            <div className="font-medium">{status!.label}</div>
            <div className="text-sg-ink-2">Arrivée</div>
            <div>{DateLabel(parseDay(r.stay.check_in))}</div>
            <div className="text-sg-ink-2">Départ</div>
            <div>{DateLabel(parseDay(r.stay.check_out))}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stepper value={nights} onChange={setNights} label="Durée du séjour" />
            {nights !== r.stay.nights && (
              <button type="button" className={primary} disabled={busy} onClick={() => run(() => store.setStay(r.number, nights))}>
                Enregistrer
              </button>
            )}
          </div>
          {nights !== r.stay.nights && (nights >= 2) !== r.eligible && (
            <div className="text-[13px] leading-[1.4] text-sg-ink-2">
              {nights >= 2 ? 'Le séjour devient éligible : le bouton du client s’allumera.' : 'Séjour d’1 nuit : le bouton du client sera éteint et verrouillé.'}
            </div>
          )}
          {confirmOut ? (
            <div className="flex flex-wrap items-center gap-2 rounded-sg-md bg-sg-surface-2 p-3 text-[14px]">
              <span className="mr-auto">Confirmer le départ de la chambre {r.number} ?</span>
              <button type="button" className={secondary} onClick={() => setConfirmOut(false)}>
                Annuler
              </button>
              <button type="button" className={primary} disabled={busy} onClick={() => run(() => store.endStay(r.number))}>
                Confirmer le départ
              </button>
            </div>
          ) : (
            <button type="button" className={`${secondary} self-start`} onClick={() => setConfirmOut(true)}>
              <DoorIcon size={16} strokeWidth={2.2} />
              Enregistrer le départ
            </button>
          )}
        </>
      ) : (
        <>
          <div className="text-[14px] leading-[1.45] text-sg-ink-2">Aucun client dans cette chambre. Enregistrez une arrivée pour activer son bouton.</div>
          <div className="flex flex-wrap items-center gap-2">
            <Stepper value={nights} onChange={setNights} label="Durée du séjour" />
            <button type="button" className={primary} disabled={busy} onClick={() => run(() => store.setStay(r.number, nights))}>
              <KeyIcon />
              Enregistrer l’arrivée
            </button>
          </div>
        </>
      )}
      <div className="text-[12px] leading-[1.4] text-sg-ink-3">Saisie manuelle en attendant la connexion au logiciel de réception (PMS).</div>
    </section>
  );
}

/** Appairage : l'adresse et le QR code de l'écran bouton de cette chambre. */
function PairingSection({ number }: { number: number }) {
  const url = roomUrl(number);
  return (
    <section className="flex flex-col gap-3">
      <div className={overline}>Bouton de la chambre</div>
      <div className="flex items-center gap-4">
        <img src={qrSrc(url)} alt={`QR code de l'écran de la chambre ${number}`} width={96} height={96} className="flex-none rounded-sg-sm bg-white p-1" />
        <div className="flex min-w-0 flex-col gap-2 text-[14px] leading-[1.4] text-sg-ink-2">
          <span>Scannez avec le téléphone ou la tablette installé(e) dans la chambre.</span>
          <span className="truncate font-mono text-[12px] text-sg-ink-3">{url.replace(/^https?:\/\//, '')}</span>
          <a href={url} target="_blank" rel="noopener" className="flex items-center gap-1.5 self-start font-medium text-sg-ink underline underline-offset-[3px]">
            Ouvrir l’écran client
            <ExternalIcon />
          </a>
        </div>
      </div>
    </section>
  );
}

function pendingVoucher(r: Room): { s: string; chip: string } {
  if (!r.stay) return { s: 'Aucun séjour', chip: 'Non proposé' };
  if (!r.eligible) return { s: "Séjour d'1 nuit", chip: 'Non proposé' };
  if (r.state === 'off') return { s: 'Nettoyage prévu', chip: 'Non émis' };
  return { s: 'Émis quand le client allume lui-même son bouton', chip: 'Non émis' };
}

function VoucherRow({ d, s, chip }: { d: string; s: string; chip: string }) {
  const style =
    chip === 'Émis'
      ? { background: 'var(--sg-ink)', color: 'var(--sg-bg)', borderColor: 'var(--sg-ink)' }
      : chip === 'Remis'
        ? { background: 'transparent', color: 'var(--sg-ink)', borderColor: 'var(--sg-line-strong)' }
        : { background: 'transparent', color: 'var(--sg-ink-2)', borderColor: 'var(--sg-line)' };
  return (
    <div className="flex items-center justify-between gap-3 border-t border-sg-line py-3">
      <div>
        <div className="text-[15px] font-medium">{d}</div>
        <div className="mt-0.5 text-[14px] text-sg-ink-2">{s}</div>
      </div>
      <span className="flex-none whitespace-nowrap rounded-sg-xs border px-2 py-1 font-mono text-[12px] uppercase tracking-[.06em]" style={style}>
        {chip}
      </span>
    </div>
  );
}

function HistoryRow({ e }: { e: RoomEvent }) {
  const departure = e.actor.startsWith('départ');
  const st = e.to_state === 'on' ? 'on' : departure ? 'free' : e.eligible ? 'off' : 'inel';
  const label = { on: 'Allumé', off: 'Éteint', inel: 'Non éligible', free: 'Départ' }[st];
  return (
    <div className="grid grid-cols-[96px_20px_minmax(0,1fr)] items-start gap-2.5 border-t border-sg-line py-3">
      <div className="font-mono text-[13px] leading-[1.45] text-sg-ink-2">
        <div>{dayLabel(e.created_at)}</div>
        <div className="text-sg-ink">{hhmm(e.created_at)}</div>
      </div>
      <div className="pt-px">
        <StateIcon state={st} size={18} />
      </div>
      <div>
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="mt-0.5 text-[14px] leading-[1.4] text-sg-ink-2">{eventSub(e)}</div>
      </div>
    </div>
  );
}
