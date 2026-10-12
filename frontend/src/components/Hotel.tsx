import type { MouseEvent, ReactNode } from 'react';
import { navigate } from '../lib/nav';
import { monogram } from '../lib/format';
import { Spinner } from './Icons';

/** Lien interne sans rechargement (la connexion temps réel est conservée). */
export function Link({ href, children, className, newTab, ...rest }: { href: string; children: ReactNode; className?: string; newTab?: boolean; 'aria-label'?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (newTab || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener' : undefined} {...rest}>
      {children}
    </a>
  );
}

/** Monogramme de l'hôtel : initiales en serif dans un anneau laiton. */
export function Monogram({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      aria-hidden
      className="grid flex-none place-items-center rounded-full font-display text-brass"
      style={{ width: size, height: size, fontSize: size * 0.4, border: '1px solid var(--sg-brass)', boxShadow: 'inset 0 0 0 3px var(--sg-lobby), inset 0 0 0 4px color-mix(in oklab, var(--sg-brass) 45%, transparent)' }}
    >
      {monogram(name)}
    </div>
  );
}

/** Bandeau sombre façon réception, en tête du dashboard et du simulateur. */
export function LobbyHeader({ hotel, section, children, compact }: { hotel: string | null; section: string; children?: ReactNode; compact?: boolean }) {
  return (
    <header className={`flex flex-none items-center justify-between gap-4 border-b border-white/10 bg-lobby text-lobby-ink ${compact ? 'h-[64px] px-4' : 'h-[76px] px-4 sm:px-8'}`}>
      <div className="flex min-w-0 items-center gap-3.5">
        <Monogram name={hotel ?? 'H'} size={compact ? 36 : 44} />
        <div className="min-w-0">
          <div className={`truncate font-display leading-tight ${compact ? 'text-[19px]' : 'text-[24px]'}`}>{hotel ?? ' '}</div>
          <div className="truncate font-mono text-[11px] uppercase tracking-[.14em] text-brass">{section}</div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-5">{children}</div>
    </header>
  );
}

/** Badge de connexion lisible sur le bandeau sombre. */
export function LobbyConnection({ conn, short }: { conn: string; short?: boolean }) {
  if (conn === 'live')
    return (
      <div role="status" className="flex h-[34px] items-center gap-2.5 whitespace-nowrap rounded-full border border-white/20 pl-3 pr-3.5 text-[14px] font-medium">
        <span className="relative h-[9px] w-[9px] flex-none">
          <span className="absolute inset-0 rounded-full bg-lobby-ink" />
          <span className="absolute inset-0 rounded-full bg-lobby-ink" style={{ animation: 'sgLive 2s ease-out infinite' }} />
        </span>
        {short ? 'En direct' : 'Connecté en direct'}
      </div>
    );
  return (
    <div role="status" className="flex h-[34px] items-center gap-2.5 whitespace-nowrap rounded-full bg-sg-warn-soft pl-3 pr-3.5 text-[14px] font-semibold text-sg-warn">
      <Spinner />
      {conn === 'connecting' ? 'Connexion…' : 'Reconnexion…'}
    </div>
  );
}

/** Plaque de porte : le numéro de chambre tel qu'il apparaît dans le couloir. */
export function DoorPlate({ number, size = 'md' }: { number: number; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: { num: 22, cap: 8, px: 8, py: 3 }, md: { num: 30, cap: 9, px: 11, py: 5 }, lg: { num: 46, cap: 10, px: 16, py: 7 } }[size];
  return (
    <div
      className="inline-flex flex-none flex-col items-center rounded-[10px] bg-sg-bg"
      style={{
        padding: `${s.py}px ${s.px}px`,
        border: '1px solid var(--sg-brass)',
        boxShadow: 'inset 0 0 0 2px var(--sg-bg), inset 0 0 0 3px color-mix(in oklab, var(--sg-brass) 40%, transparent)',
      }}
    >
      <span className="font-mono uppercase text-brass-ink" style={{ fontSize: s.cap, letterSpacing: '.16em', lineHeight: 1.2 }}>
        Chambre
      </span>
      <span className="font-display tabular-nums leading-none" style={{ fontSize: s.num }}>
        {number}
      </span>
    </div>
  );
}

export const floorLabel = (floor: number) => (floor === 0 ? 'Rez-de-chaussée' : floor === 1 ? '1er étage' : `${floor}e étage`);

/** Intitulé d'étage avec filet laiton, comme la signalétique d'un palier. */
export function FloorHeading({ floor, meta }: { floor: number; meta: string }) {
  const n = floor === 1 ? '1' : String(floor);
  return (
    <div className="mb-4 mt-8 flex items-center gap-4">
      <h2 className="flex-none font-display text-[26px] font-normal leading-none">
        {floor === 0 ? (
          'Rez-de-chaussée'
        ) : (
          <>
            {n}
            <sup className="text-[15px]">{floor === 1 ? 'er' : 'e'}</sup> étage
          </>
        )}
      </h2>
      <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, var(--sg-brass), transparent)' }} />
      <div className="flex-none font-mono text-[12px] uppercase tracking-[.08em] text-sg-ink-3">{meta}</div>
    </div>
  );
}

export const LeafIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 19c0-9 5-14 15-15-1 10-6 15-15 15z" />
    <path d="M5 19l7-7" />
  </svg>
);

export const KeyIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
  </svg>
);

export const ExternalIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
