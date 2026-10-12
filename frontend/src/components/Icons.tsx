import type { DisplayState } from '../lib/types';

type P = { size?: number; className?: string; strokeWidth?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: false as const,
});

export const CheckIcon = ({ size = 16, strokeWidth = 2.6, className }: P) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** Disque plein + coche : état « allumé » (pas de nettoyage). */
export const OnDiscIcon = ({ size = 20, strokeWidth = 2.6, className }: P) => (
  <svg {...base(size)} className={className} style={{ flex: 'none' }}>
    <circle cx="12" cy="12" r="10" style={{ fill: 'var(--sg-on)' }} />
    <path d="M7 12.5l3.2 3.2L17 8.8" style={{ fill: 'none', stroke: 'var(--sg-on-fg)' }} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Anneau vide : état « éteint » (nettoyage normal). */
export const RingIcon = ({ size = 20, strokeWidth = 2.6, className }: P) => (
  <svg {...base(size)} className={className} style={{ flex: 'none' }} fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="8.5" />
  </svg>
);

/** Cadenas : non éligible. */
export const LockIcon = ({ size = 20, strokeWidth = 2.2, className }: P) => (
  <svg {...base(size)} className={className} style={{ flex: 'none' }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="11" width="14" height="9.5" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/** Porte : chambre libre, aucun séjour. */
export const DoorIcon = ({ size = 20, strokeWidth = 2.2, className }: P) => (
  <svg {...base(size)} className={className} style={{ flex: 'none' }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" />
    <path d="M3.5 21h17" />
    <path d="M14.5 12.5v.01" />
  </svg>
);

export const SyncArrowsIcon = ({ size = 15, strokeWidth = 2.4, className }: P) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" />
    <path d="M18 3v4h-4M6 21v-4h4" />
  </svg>
);

export const OfflineIcon = ({ size = 15, strokeWidth = 2.6, className }: P) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 18L18 6" />
  </svg>
);

export const AlertIcon = ({ size = 18, strokeWidth = 2.4, className }: P) => (
  <svg {...base(size)} className={className} style={{ flex: 'none' }} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5v.01" />
  </svg>
);

export const ResetIcon = ({ size = 15, className }: P) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </svg>
);

export const ChevronIcon = ({ size = 16, up = false, className }: P & { up?: boolean }) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);

export const CloseIcon = ({ size = 14, className }: P) => (
  <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Spinner = ({ size = 13, className = '' }: { size?: number; className?: string }) => (
  <span
    aria-hidden
    className={`sg-spin inline-block flex-none rounded-full border-2 border-current ${className}`}
    style={{ width: size, height: size, borderRightColor: 'transparent' }}
  />
);

/** Icône d'état : forme distincte pour chaque état (lisible en niveaux de gris). */
export function StateIcon({ state, size = 22 }: { state: DisplayState; size?: number }) {
  if (state === 'on') return <OnDiscIcon size={size} />;
  if (state === 'off') return <RingIcon size={size} />;
  if (state === 'inel') return <LockIcon size={size} />;
  return <DoorIcon size={size} />;
}
