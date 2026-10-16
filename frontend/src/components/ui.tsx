/** Kit d'interface GreenKeeping : mesures reprises de la maquette. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { DisplayState } from '../lib/types';
import { Icon, Spinner, type IconName } from './Icons';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------ boutons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  busy,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: IconName; busy?: boolean }) {
  const sizes = { sm: 'h-9 px-3.5 text-[13px] gap-1.5', md: 'h-10 px-4 text-[14px] gap-2', lg: 'h-11 px-[18px] text-[14px] gap-2' }[size];
  const variants = {
    primary: 'border border-brand-500 bg-brand-500 text-white hover:bg-brand-600 hover:border-brand-600 disabled:opacity-50',
    secondary: 'border border-line bg-surface text-ink-700 hover:bg-canvas disabled:opacity-45',
    ghost: 'border border-transparent bg-transparent text-ink-700 hover:bg-canvas disabled:opacity-45',
    danger: 'border border-line bg-surface text-err-text hover:bg-err-bg disabled:opacity-45',
  }[variant];
  return (
    <button
      type="button"
      className={cx('inline-flex flex-none cursor-pointer items-center justify-center whitespace-nowrap rounded-btn font-semibold transition-colors disabled:cursor-not-allowed', sizes, variants, className)}
      {...rest}
    >
      {busy ? <Spinner size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, badge, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; badge?: number }) {
  return (
    <button
      type="button"
      aria-label={badge ? `${label}, ${badge} non lue${badge > 1 ? 's' : ''}` : label}
      title={label}
      className={cx('relative grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-btn border-0 bg-transparent text-ink-500 hover:bg-canvas hover:text-ink-900', className)}
      {...rest}
    >
      <Icon name={icon} size={19} />
      {!!badge && (
        <span
          className="absolute right-1 top-1 h-[18px] min-w-[18px] rounded-full bg-brand-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white"
          style={{ boxShadow: '0 0 0 2px var(--surface)' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ------------------------------------------------------------------- cartes

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' }) {
  return <As className={cx('gk-card rounded-card border border-line bg-surface shadow-card', className)}>{children}</As>;
}

export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500', className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="m-0 text-[28px] font-bold leading-[1.2] tracking-[-.02em] text-ink-900 sm:text-[32px]">{title}</h1>
        {subtitle && <p className="m-0 mt-1.5 text-[13px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-semibold leading-[1.3] text-ink-900">{children}</h2>
        {sub && <span className="text-[13px] text-ink-500">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

// ------------------------------------------------------------------- états

export const STATE_TEXT: Record<DisplayState, string> = {
  on: 'Sans nettoyage',
  off: 'Nettoyage normal',
  inel: 'Non éligible',
  free: 'Chambre libre',
};

/** Pastille d'état : couleur + point + libellé (jamais la couleur seule). */
export function StatusBadge({ state, size = 'md' }: { state: DisplayState; size?: 'sm' | 'md' }) {
  const tone = state === 'on' ? 'bg-ok-bg text-ok-text' : state === 'off' ? 'bg-info-bg text-info-text' : 'bg-mute-bg text-mute-text';
  const dot = state === 'on' ? 'bg-ok-dot' : state === 'off' ? 'bg-info-dot' : 'bg-mute-dot';
  return (
    <span className={cx('inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-semibold', size === 'sm' ? 'h-[22px] text-[11px]' : 'h-6 text-[11px]', tone)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
      {STATE_TEXT[state]}
    </span>
  );
}

export const stateDot = (state: DisplayState) => (state === 'on' ? 'var(--ok-dot)' : state === 'off' ? 'var(--info-dot)' : 'var(--mute-dot)');

// ------------------------------------------------------------- interrupteur

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  busy,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cx(
        'relative h-[26px] w-[44px] flex-none cursor-pointer rounded-full border-0 p-0 transition-colors duration-switch disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-500' : 'bg-mute-bg',
      )}
      style={checked ? undefined : { boxShadow: 'inset 0 0 0 1px var(--line)' }}
    >
      <span
        className="absolute top-[3px] grid h-5 w-5 place-items-center rounded-full bg-white text-brand-500 transition-[left] duration-switch"
        style={{ left: checked ? 21 : 3, boxShadow: '0 1px 2px rgba(26,24,20,.2)' }}
      >
        {busy && <Spinner size={10} />}
      </span>
    </button>
  );
}

// --------------------------------------------------------------- sélecteurs

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone = 'surface',
  label,
}: {
  options: { value: T; label: ReactNode; icon?: IconName; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  tone?: 'surface' | 'canvas';
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-none gap-0.5 rounded-btn p-[3px]', tone === 'surface' ? 'border border-line bg-surface' : 'bg-canvas')}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] border-0 px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-45',
              active
                ? tone === 'surface'
                  ? 'bg-brand-100 text-ink-900'
                  : 'bg-surface text-ink-900 shadow-[0_1px_2px_rgba(26,24,20,.08)]'
                : 'bg-transparent text-ink-500 hover:text-ink-900',
            )}
          >
            {o.icon && <Icon name={o.icon} size={15} className={active ? 'text-brand-500' : undefined} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterChip({ active, count, onClick, children }: { active: boolean; count?: number; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold',
        active ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-surface text-ink-700 hover:bg-canvas',
      )}
    >
      {children}
      {count !== undefined && <span className={cx('tabular-nums', active ? '' : 'text-ink-500')}>{count}</span>}
    </button>
  );
}

export function SearchField({ value, onChange, placeholder, width = 260, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number | string; onEnter?: () => void }) {
  return (
    <label className="flex h-10 flex-none items-center gap-2.5 rounded-btn bg-canvas px-3 text-ink-500" style={{ width }}>
      <Icon name="search" size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink-900 outline-none"
      />
    </label>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  return (
    <span className="grid flex-none place-items-center rounded-full bg-brand-100 font-bold text-ink-900" style={{ width: size, height: size, fontSize: size * 0.35 }} aria-hidden>
      {ini}
    </span>
  );
}

// ------------------------------------------------------------------ champs

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">
        {label}
      </label>
      {children}
      {hint && <span className="text-[12px] text-ink-500">{hint}</span>}
    </div>
  );
}

export const inputClass =
  'h-11 w-full rounded-btn border border-line bg-surface px-3 text-[14px] text-ink-900 outline-none focus:border-brand-500 disabled:opacity-60';

// ------------------------------------------------------------------ fenêtres

export function Modal({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'var(--scrim)' }} onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-pop"
        style={{ maxWidth: width, animation: 'gkFade .15s ease-out' }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h2 id={id} className="m-0 text-[18px] font-semibold text-ink-900">
            {title}
          </h2>
          <IconButton icon="x" label="Fermer" onClick={onClose} />
        </div>
        <div className="overflow-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Message éphémère en haut de l'écran. */
export function Toast({ tone = 'info', children, onClose }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode; onClose: () => void }) {
  const tones = { info: 'bg-ink-900 text-surface', error: 'bg-err-bg text-err-text', ok: 'bg-ok-bg text-ok-text' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex max-w-[560px] items-start gap-2.5 rounded-btn px-4 py-3 text-[14px] font-medium shadow-pop', tones)} style={{ animation: 'gkFade .2s ease-out' }}>
      <Icon name={tone === 'error' ? 'alert' : tone === 'ok' ? 'check' : 'bell'} size={18} className="mt-0.5" />
      <span className="flex-1">{children}</span>
      <button type="button" onClick={onClose} aria-label="Fermer le message" className="flex-none cursor-pointer border-0 bg-transparent p-0.5 text-current">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export { cx };
