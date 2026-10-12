import type { KeyboardEvent, MouseEvent } from 'react';
import { byLabel, stayStatus, whenLabel } from '../lib/format';
import { displayState, type ButtonValue, type Room } from '../lib/types';
import { DoorPlate, Led } from './Hotel';
import { CheckIcon, DoorIcon, LockIcon, Spinner, StateIcon, SyncArrowsIcon } from './Icons';

export const STATE_LABEL = { on: 'Pas de nettoyage', off: 'Nettoyage', inel: 'Non éligible', free: 'Chambre libre' } as const;

interface Props {
  room: Room;
  selected: boolean;
  pulseNote?: string;
  syncTarget: ButtonValue | null;
  onOpen: () => void;
  onForce: () => void;
}

/** Tuile de chambre : couleur + icône + libellé, jamais la couleur seule. */
export default function RoomTile({ room: r, selected, pulseNote, syncTarget, onOpen, onForce }: Props) {
  const st = displayState(r);
  const on = st === 'on';
  const dashed = st === 'inel' || st === 'free';
  const canForce = r.eligible && !!r.stay && !syncTarget;
  const status = r.stay ? stayStatus(r.stay) : null;

  const border = on ? '1.5px solid var(--sg-on)' : dashed ? '1.5px dashed var(--sg-line-strong)' : '1.5px solid var(--sg-line-strong)';
  const key = (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpen();
    }
  };
  const force = (e: MouseEvent) => {
    e.stopPropagation();
    onForce();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Chambre ${r.number} : ${STATE_LABEL[st]}. Ouvrir le détail.`}
      onClick={onOpen}
      onKeyDown={key}
      className="relative box-border flex min-h-[214px] cursor-pointer flex-col gap-3 rounded-sg-lg px-[18px] pb-3.5 pt-4 transition-[box-shadow,transform] duration-switch hover:-translate-y-px hover:shadow-sg"
      style={{
        border,
        background: dashed ? 'var(--sg-surface-2)' : 'var(--sg-surface)',
        outline: selected ? '2px solid var(--sg-ink)' : '2px solid transparent',
        outlineOffset: 3,
        animation: pulseNote ? 'sgTilePulse 1.2s ease-out 3' : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <DoorPlate number={r.number} />
        <div className="flex flex-col items-end gap-1.5">
          {pulseNote && (
            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sg-ink px-[9px] py-1 text-[12px] font-semibold text-sg-bg">
              <SyncArrowsIcon size={12} strokeWidth={3} />
              {pulseNote}
            </div>
          )}
          {on && !pulseNote && <Led on mode="steady" size={9} />}
          {on && pulseNote && <Led on mode="flash" size={9} />}
          {r.is_suite && <span className="sg-label rounded-sg-xs border border-sg-line-strong px-1.5 py-0.5 text-[10px] text-sg-ink-2">Suite</span>}
        </div>
      </div>

      <div className="flex items-center gap-[9px] text-title font-semibold" style={{ color: on ? 'var(--sg-on-ink)' : 'var(--sg-ink)' }}>
        <StateIcon state={st} size={22} />
        {STATE_LABEL[st]}
      </div>

      <div className="flex flex-col gap-1 text-[14px] leading-[1.35] text-sg-ink-2">
        {status ? (
          <div>
            <span className="font-medium text-sg-ink">{status.label}</span> · {status.detail}
          </div>
        ) : (
          <div>Aucun séjour en cours</div>
        )}
        {(r.stay || r.updated_by !== 'system') && (
          <div>
            <span className="font-mono text-[13px] text-sg-ink">{whenLabel(r.updated_at)}</span> · {byLabel(r)}
          </div>
        )}
      </div>

      <div className="mt-auto flex min-h-8 items-center justify-between gap-2 border-t border-sg-line pt-3">
        {syncTarget ? (
          <>
            <span className="flex items-center gap-2 text-[13px] font-semibold text-sg-warn">
              <Spinner size={12} />
              Synchronisation…
            </span>
            <span className="text-[13px] text-sg-ink-3">{syncTarget === 'on' ? '→ Allumé' : '→ Éteint'}</span>
          </>
        ) : canForce ? (
          <>
            <span className="text-[13px] text-sg-ink-2">Forçage à distance</span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`Forcer la chambre ${r.number}, actuellement ${on ? 'allumé, pas de nettoyage' : 'éteint, nettoyage normal'}`}
              onClick={force}
              onKeyDown={(e) => e.stopPropagation()}
              className="relative box-border h-[30px] w-[54px] flex-none cursor-pointer rounded-full p-0 transition-colors duration-switch"
              style={{ border: `1.5px solid ${on ? 'var(--sg-on)' : 'var(--sg-line-strong)'}`, background: on ? 'var(--sg-on)' : 'var(--sg-surface-2)' }}
            >
              <span
                className="absolute top-0.5 grid h-[23px] w-[23px] place-items-center rounded-full transition-[left] duration-switch"
                style={{ left: on ? 26 : 2, background: on ? 'var(--sg-on-fg)' : 'var(--sg-ink-2)', color: 'var(--sg-on)' }}
              >
                {on && <CheckIcon size={13} strokeWidth={3.4} />}
              </span>
            </button>
          </>
        ) : r.stay ? (
          <span className="flex items-center gap-[7px] text-[13px] text-sg-ink-2">
            <LockIcon size={14} strokeWidth={2.4} />
            {on ? 'Forcé · séjour 1 nuit' : 'Verrouillé · dès 2 nuits'}
          </span>
        ) : (
          <span className="flex items-center gap-[7px] text-[13px] text-sg-ink-2">
            <DoorIcon size={14} strokeWidth={2.4} />
            Libre · prête pour une arrivée
          </span>
        )}
      </div>
    </div>
  );
}
