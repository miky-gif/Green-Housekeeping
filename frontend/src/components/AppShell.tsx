import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, HttpError } from '../lib/api';
import { activityLine, hhmm, topbarDate } from '../lib/format';
import { navigate, usePath } from '../lib/nav';
import { useProgram } from '../lib/program';
import { useSession } from '../lib/session';
import { useNow, useRemoteChanges, useStore, useStoreErrors } from '../lib/store';
import { isDark, setTheme, useTheme } from '../lib/theme';
import type { RoomEvent } from '../lib/types';
import { Icon, type IconName } from './Icons';
import { Avatar, Button, cx, IconButton, inputClass, Field, Modal, Toast } from './ui';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: 'dashboard' },
  { href: '/dashboard/chambres', label: 'Chambres', icon: 'bed' },
  { href: '/dashboard/historique', label: 'Historique', icon: 'history' },
  { href: '/dashboard/rapports', label: 'Rapports', icon: 'chart' },
  { href: '/dashboard/parametres', label: 'Paramètres', icon: 'sliders' },
];

interface Notice {
  id: string;
  at: string;
  text: string;
  room: number;
}

const SEEN_KEY = 'gk.notices.seen';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Coque de l'application : barre latérale, barre du haut, notifications, barre de démo. */
export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePath();
  const store = useStore();
  const { user } = useSession();
  const program = useProgram();
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<{ tone: 'info' | 'error'; text: ReactNode } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [seen, setSeen] = useState(readSeen);
  const toastTimer = useRef<number | undefined>(undefined);

  const show = (tone: 'info' | 'error', text: ReactNode) => {
    setToast({ tone, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => setDrawer(false), [path]);

  // Notifications : demandes de nettoyage et forçages faits ailleurs (réglables dans Paramètres).
  useRemoteChanges(({ room, prev, stayChanged }) => {
    if (stayChanged || room.state === prev.state) return;
    const at = room.updated_at;
    let text: string | null = null;
    if (room.updated_by === 'guest' && room.state === 'off' && program?.notify_cleaning_request !== false)
      text = `Chambre ${room.number} — le client demande son nettoyage`;
    else if (room.updated_by === 'staff' && program?.notify_force_by_other !== false)
      text = room.state === 'on' ? `Chambre ${room.number} forcée sans nettoyage par un autre membre` : `Chambre ${room.number} — nettoyage rétabli par un autre membre`;
    if (!text) return;
    setNotices((n) => [{ id: `${room.number}-${room.rev}`, at, text: text!, room: room.number }, ...n].slice(0, 30));
    show('info', text);
  });

  useStoreErrors((e) => show('error', e.room ? `Chambre ${e.room} · ${e.message}` : e.message));

  // Notifications des dernières 24 h au chargement (demandes de nettoyage).
  useEffect(() => {
    api.events(1, 'guest').then(
      (evs: RoomEvent[]) =>
        setNotices((cur) =>
          cur.length
            ? cur
            : evs.filter((e) => e.to_state === 'off').map((e) => ({ id: `e${e.id}`, at: e.created_at, text: activityLine(e), room: e.room! })),
        ),
      () => undefined,
    );
  }, []);

  const unread = notices.filter((n) => n.at > seen).length;
  const markSeen = () => {
    const latest = notices[0]?.at ?? new Date().toISOString();
    setSeen(latest);
    try {
      localStorage.setItem(SEEN_KEY, latest);
    } catch {
      /* sans conséquence */
    }
  };

  const sidebar = (
    <Sidebar path={path} user={user ?? null} onNavigate={() => setDrawer(false)} />
  );

  return (
    <div className="gk-app grid min-h-[100dvh] bg-canvas text-ink-700 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="gk-no-print hidden border-r border-line bg-surface lg:block">{sidebar}</aside>
      {drawer && (
        <div className="gk-no-print fixed inset-0 z-40 lg:hidden" style={{ background: 'var(--scrim)' }} onClick={() => setDrawer(false)}>
          <aside className="h-full w-[260px] border-r border-line bg-surface" onClick={(e) => e.stopPropagation()} style={{ animation: 'gkFade .15s ease-out' }}>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <Topbar conn={store.conn} unread={unread} notices={notices} onOpenNotices={markSeen} onMenu={() => setDrawer(true)} />
        <main className="flex flex-1 flex-col gap-5 px-4 pb-28 pt-8 sm:px-10">{children}</main>
      </div>

      {toast && (
        <div className="gk-no-print fixed left-1/2 top-4 z-[60] w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2">
          <Toast tone={toast.tone} onClose={() => setToast(null)}>
            {toast.text}
          </Toast>
        </div>
      )}
    </div>
  );
}

function Sidebar({ path, user, onNavigate }: { path: string; user: { name: string; title: string; role: string } | null; onNavigate: () => void }) {
  const [menu, setMenu] = useState(false);
  const [pwd, setPwd] = useState(false);
  const { logout } = useSession();
  const active = (href: string) => (href === '/dashboard' ? path === '/dashboard' || path === '/dashboard/' : path.startsWith(href));

  return (
    <div className="sticky top-0 flex h-[100dvh] max-h-[100dvh] flex-col gap-6 overflow-auto px-4 py-5">
      <div className="flex items-center gap-2.5 px-2 py-1">
        <span className="grid h-9 w-9 place-items-center rounded-btn bg-brand-500 text-[18px] font-bold text-white">G</span>
        <span className="text-[16px] font-bold tracking-[-.01em] text-ink-900">GreenKeeping</span>
      </div>

      {user && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] border border-line bg-transparent p-3 text-left hover:bg-canvas"
          >
            <Avatar name={user.name} />
            <span className="flex min-w-0 flex-col leading-[1.35]">
              <span className="truncate text-[14px] font-semibold text-ink-900">{user.name}</span>
              <span className="truncate text-[12px] text-ink-500">{user.title}</span>
            </span>
          </button>
          {menu && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[12px] border border-line bg-surface shadow-pop" style={{ animation: 'gkFade .12s ease-out' }}>
              <MenuItem icon="key" onClick={() => (setMenu(false), setPwd(true))}>
                Changer le mot de passe
              </MenuItem>
              <MenuItem
                icon="logout"
                onClick={async () => {
                  await logout();
                  navigate('/connexion', true);
                }}
              >
                Se déconnecter
              </MenuItem>
            </div>
          )}
        </div>
      )}

      <nav className="flex flex-col gap-1" aria-label="Navigation principale">
        {NAV.map((item) => {
          const on = active(item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={on ? 'page' : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onNavigate();
                navigate(item.href);
              }}
              className={cx(
                'flex h-11 items-center gap-3 rounded-btn px-3 text-[14px] font-medium no-underline',
                on ? 'bg-brand-100 text-brand-600' : 'text-ink-700 hover:bg-canvas',
              )}
            >
              <Icon name={item.icon} size={19} className={on ? 'text-brand-500' : 'text-ink-300'} />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 rounded-card border border-brand-200 bg-brand-50 p-5">
        <span className="text-[14px] font-bold text-ink-900">Bilan Green Key</span>
        <span className="text-[12px] leading-[1.5] text-ink-700">Rapport mensuel du programme pilote, prêt pour l'audit.</span>
        <Button variant="primary" className="mt-2 w-full" onClick={() => (onNavigate(), navigate('/dashboard/rapports'))}>
          Voir le rapport
        </Button>
      </div>
      <PasswordDialog open={pwd} onClose={() => setPwd(false)} />
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: IconName; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3.5 py-2.5 text-left text-[14px] text-ink-700 hover:bg-canvas">
      <Icon name={icon} size={16} className="text-ink-500" />
      {children}
    </button>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setMsg({ ok: true, text: 'Mot de passe modifié.' });
      setCurrent('');
      setNext('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'Serveur injoignable.' });
    }
    setBusy(false);
  };
  return (
    <Modal
      open={open}
      onClose={() => (onClose(), setMsg(null))}
      title="Changer le mot de passe"
      footer={
        <>
          <Button onClick={onClose}>Fermer</Button>
          <Button variant="primary" busy={busy} disabled={!current || next.length < 8} onClick={submit}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Mot de passe actuel" htmlFor="pw-cur">
          <input id="pw-cur" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="pw-new" hint="8 caractères minimum.">
          <input id="pw-new" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {msg && <div className={cx('rounded-btn px-3 py-2 text-[13px] font-medium', msg.ok ? 'bg-ok-bg text-ok-text' : 'bg-err-bg text-err-text')}>{msg.text}</div>}
      </div>
    </Modal>
  );
}

function Topbar({ conn, unread, notices, onOpenNotices, onMenu }: { conn: string; unread: number; notices: Notice[]; onOpenNotices: () => void; onMenu: () => void }) {
  const now = useNow(20000);
  const theme = useTheme();
  const [open, setOpen] = useState<'notices' | 'lang' | null>(null);
  const dark = useMemo(() => isDark(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <header className="gk-no-print sticky top-0 z-30 flex h-[68px] items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-10">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton icon="list" label="Menu" className="lg:hidden" onClick={onMenu} />
        <GlobalSearch />
      </div>
      <div className="flex flex-none items-center gap-2">
        <IconButton icon={dark ? 'sun' : 'moon'} label="Changer de thème" onClick={() => setTheme(dark ? 'light' : 'dark')} />
        <div className="relative">
          <IconButton
            icon="bell"
            label="Notifications"
            badge={unread}
            onClick={() => {
              setOpen((o) => (o === 'notices' ? null : 'notices'));
              onOpenNotices();
            }}
          />
          {open === 'notices' && (
            <Popover onClose={() => setOpen(null)} width={340}>
              <div className="border-b border-line px-4 py-3 text-[14px] font-semibold text-ink-900">Notifications</div>
              {notices.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-ink-500">Aucune notification pour le moment.</div>
              ) : (
                <ul className="m-0 max-h-[360px] list-none overflow-auto p-0">
                  {notices.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => (setOpen(null), navigate(`/dashboard/chambres?chambre=${n.room}`))}
                        className="flex w-full cursor-pointer gap-3 border-0 border-b border-line bg-transparent px-4 py-3 text-left hover:bg-canvas"
                      >
                        <span className="w-11 flex-none text-[12px] tabular-nums text-ink-500">{hhmm(n.at)}</span>
                        <span className="text-[13px] leading-[1.45] text-ink-900">{n.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Popover>
          )}
        </div>
        <IconButton icon="sliders" label="Paramètres" className="hidden sm:grid" onClick={() => navigate('/dashboard/parametres')} />
        <div className="relative hidden sm:block">
          <button
            type="button"
            aria-label="Langue de l'interface"
            onClick={() => setOpen((o) => (o === 'lang' ? null : 'lang'))}
            className="flex h-10 cursor-pointer items-center gap-1 rounded-btn border border-line bg-surface pl-3 pr-2.5 text-[13px] font-semibold text-ink-700"
          >
            FR
            <Icon name="chevronDown" size={15} />
          </button>
          {open === 'lang' && (
            <Popover onClose={() => setOpen(null)} width={200}>
              <LangOption active label="Français" />
              <LangOption label="Nederlands" />
              <LangOption label="English" />
            </Popover>
          )}
        </div>
        <span className="mx-2 hidden h-7 w-px bg-line md:block" />
        <span className="hidden whitespace-nowrap text-[13px] tabular-nums text-ink-700 md:inline">{topbarDate(now)}</span>
        <LivePill conn={conn} />
      </div>
    </header>
  );
}

function LangOption({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className={cx('flex items-center justify-between px-4 py-2.5 text-[14px]', active ? 'font-semibold text-ink-900' : 'text-ink-500')}>
      {label}
      {active ? <Icon name="check" size={16} className="text-brand-500" /> : <span className="text-[11px]">Bientôt</span>}
    </div>
  );
}

export function LivePill({ conn }: { conn: string }) {
  if (conn === 'live')
    return (
      <span role="status" className="ml-2 inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-ok-bg px-3 text-[12px] font-semibold text-ok-text">
        <span className="h-1.5 w-1.5 rounded-full bg-ok-dot" style={{ boxShadow: '0 0 0 3px rgba(21,160,107,.2)' }} />
        En direct
      </span>
    );
  return (
    <span role="status" className="ml-2 inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-warn-bg px-3 text-[12px] font-semibold text-warn-text">
      <span className="gk-spin inline-block h-2.5 w-2.5 rounded-full border-2 border-current" style={{ borderRightColor: 'transparent' }} />
      {conn === 'connecting' ? 'Connexion…' : 'Reconnexion…'}
    </span>
  );
}

function Popover({ children, onClose, width }: { children: ReactNode; onClose: () => void; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[12px] border border-line bg-surface shadow-pop" style={{ width, animation: 'gkFade .12s ease-out' }}>
      {children}
    </div>
  );
}

/** Recherche : un numéro ouvre la chambre, « étage 7 » filtre l'étage. */
function GlobalSearch() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const rooms = store.list();
  const term = q.trim().toLowerCase();
  const floorMatch = term.match(/^(?:étage|etage)\s*(\d+)$/);
  const matches = term
    ? rooms.filter((r) => String(r.number).startsWith(term.replace(/\D/g, '') || '#') || r.room_type.toLowerCase().includes(term)).slice(0, 6)
    : [];
  const go = (href: string) => {
    setQ('');
    setFocus(false);
    navigate(href);
  };
  const submit = () => {
    if (floorMatch) return go(`/dashboard/chambres?etage=${floorMatch[1]}`);
    if (matches[0]) return go(`/dashboard/chambres?chambre=${matches[0].number}`);
  };
  return (
    <div className="relative">
      <label className="flex h-10 w-[min(360px,52vw)] items-center gap-2.5 rounded-btn border border-transparent bg-canvas px-3 text-ink-500 focus-within:border-brand-200">
        <Icon name="search" size={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => window.setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Rechercher une chambre, un étage…"
          aria-label="Rechercher une chambre, un étage"
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink-900 outline-none"
        />
      </label>
      {focus && term && (floorMatch || matches.length > 0) && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full overflow-hidden rounded-[12px] border border-line bg-surface shadow-pop">
          {floorMatch && (
            <button type="button" onMouseDown={() => go(`/dashboard/chambres?etage=${floorMatch[1]}`)} className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-2.5 text-left text-[14px] hover:bg-canvas">
              <Icon name="building" size={16} className="text-ink-500" /> Étage {floorMatch[1]}
            </button>
          )}
          {matches.map((r) => (
            <button
              key={r.number}
              type="button"
              onMouseDown={() => go(`/dashboard/chambres?chambre=${r.number}`)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-4 py-2.5 text-left text-[14px] hover:bg-canvas"
            >
              <span className="font-semibold text-ink-900">Chambre {r.number}</span>
              <span className="text-[12px] text-ink-500">
                {r.room_type} · Étage {r.floor}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
