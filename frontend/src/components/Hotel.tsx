import type { MouseEvent, ReactNode } from 'react';
import { navigate } from '../lib/nav';
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

/** Nom de l'hôtel en capitales larges (texte, pas le logo de l'hôtel). */
export function Wordmark({ name, className = '' }: { name: string | null; className?: string }) {
  return <span className={`sg-wide truncate font-semibold ${className}`}>{name ?? ' '}</span>;
}

/** Bandeau noir en tête d'écran, à la manière du site de l'hôtel. */
export function LobbyHeader({ hotel, section, children, compact }: { hotel: string | null; section: string; children?: ReactNode; compact?: boolean }) {
  return (
    <header className={`flex flex-none items-center justify-between gap-4 bg-lobby text-lobby-ink ${compact ? 'h-[60px] px-4' : 'h-[68px] px-4 sm:px-8'}`}>
      {compact ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Wordmark name={hotel} className="text-[13px]" />
          <span className="sg-label flex items-center gap-2 text-[10px] text-lobby-ink-2">
            <span aria-hidden className="h-1.5 w-1.5 flex-none bg-accent" />
            {section}
          </span>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-4">
          <Wordmark name={hotel} className="text-[16px]" />
          <span className="hidden h-5 w-px flex-none bg-white/25 sm:block" />
          <span className="sg-label hidden items-center gap-2 text-lobby-ink-2 sm:flex">
            <span aria-hidden className="h-1.5 w-1.5 flex-none bg-accent" />
            {section}
          </span>
        </div>
      )}
      <div className="flex flex-none items-center gap-5">{children}</div>
    </header>
  );
}

/** Badge de connexion lisible sur le bandeau noir. */
export function LobbyConnection({ conn, short }: { conn: string; short?: boolean }) {
  if (conn === 'live')
    return (
      <div role="status" className="flex h-8 items-center gap-2.5 whitespace-nowrap rounded-full border border-white/25 pl-3 pr-3.5 text-[13px] font-medium">
        <span className="relative h-2 w-2 flex-none">
          <span className="absolute inset-0 rounded-full bg-lobby-ink" />
          <span className="absolute inset-0 rounded-full bg-lobby-ink" style={{ animation: 'sgLive 2s ease-out infinite' }} />
        </span>
        {short ? 'En direct' : 'Connecté en direct'}
      </div>
    );
  return (
    <div role="status" className="flex h-8 items-center gap-2.5 whitespace-nowrap rounded-full bg-sg-warn-soft pl-3 pr-3.5 text-[13px] font-semibold text-sg-warn">
      <Spinner />
      {conn === 'connecting' ? 'Connexion…' : 'Reconnexion…'}
    </div>
  );
}

/** Numéro de chambre : petit libellé + chiffres larges, sobre comme la signalétique de l'hôtel. */
export function DoorPlate({ number, size = 'md' }: { number: number; size?: 'sm' | 'md' | 'lg' }) {
  const num = { sm: 24, md: 32, lg: 48 }[size];
  return (
    <div className="flex flex-none flex-col">
      <span className="sg-label text-sg-ink-3" style={{ fontSize: size === 'lg' ? 11 : 10 }}>
        Chambre
      </span>
      <span className="font-display font-medium tabular-nums leading-none" style={{ fontSize: num, marginTop: size === 'sm' ? 2 : 4 }}>
        {number}
      </span>
    </div>
  );
}

/**
 * Voyant vert, comme sur un bouton physique. Allumé : il « respire » ;
 * en clignotement : un message est en cours de transmission ou vient d'arriver.
 */
export function Led({ on, mode = 'breath', size = 10 }: { on: boolean; mode?: 'breath' | 'blink' | 'flash' | 'steady'; size?: number }) {
  if (!on)
    return <span aria-hidden className="inline-block flex-none rounded-full border-2 border-sg-line-strong" style={{ width: size, height: size }} />;
  const cls = mode === 'blink' ? 'sg-led-blink' : mode === 'flash' ? 'sg-led-flash' : mode === 'breath' ? 'sg-led-breath' : '';
  return (
    <span
      aria-hidden
      className={`inline-block flex-none rounded-full ${cls}`}
      style={{ width: size, height: size, background: 'var(--sg-led)', boxShadow: `0 0 ${size * 0.8}px var(--sg-led), 0 0 ${size * 2}px color-mix(in oklab, var(--sg-led) 55%, transparent)` }}
    />
  );
}

export const floorLabel = (floor: number) => (floor === 0 ? 'Rez-de-chaussée' : `Étage ${floor}`);

/** Intitulé d'étage. */
export function FloorHeading({ floor, meta }: { floor: number; meta: string }) {
  return (
    <div className="mb-4 mt-9 flex items-center gap-4">
      <h2 className="sg-wide m-0 flex-none text-[15px] font-semibold">{floorLabel(floor)}</h2>
      <div className="h-px flex-1 bg-sg-line-strong" />
      <div className="sg-label flex-none text-sg-ink-3">{meta}</div>
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
