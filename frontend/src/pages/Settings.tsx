import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icons';
import { Avatar, Button, Card, cx, Field, inputClass, Modal, PageHeader, Segmented, Toggle } from '../components/ui';
import { api, HttpError } from '../lib/api';
import { nightsLabel } from '../lib/format';
import { setProgram, useProgram } from '../lib/program';
import { useSession } from '../lib/session';
import { store, useStore } from '../lib/store';
import { setTheme, useTheme, type ThemePref } from '../lib/theme';
import type { ProgramSettings, User } from '../lib/types';

const SECTIONS = [
  ['regles', 'Règles du programme'],
  ['boisson', 'Boisson offerte'],
  ['chambres', 'Chambres pilotes'],
  ['ratios', 'Ratios d’impact'],
  ['notifications', 'Notifications'],
  ['equipe', 'Équipe et rôles'],
  ['affichage', 'Affichage'],
] as const;

const ROOM_TYPES = ['Superior Room', 'Deluxe Room', 'Panoramic Room', 'The Suite', 'Chambre'];
const PICKUPS = ['Sur présentation du numéro de chambre', 'Sur présentation de la carte-clé', 'Servie en chambre'];

/** Paramètres — maquette 2g. */
export default function Settings() {
  const program = useProgram();
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [draft, setDraft] = useState<ProgramSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [active, setActive] = useState<string>('regles');

  useEffect(() => {
    document.title = 'Paramètres · GreenKeeping';
  }, []);
  useEffect(() => {
    if (program && !draft) setDraft(program);
  }, [program, draft]);

  // Arrivée par un lien (#ratios…) : on fait défiler jusqu'à la section.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id && draft) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    SECTIONS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [draft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !!(draft && program && JSON.stringify(draft) !== JSON.stringify(program)), [draft, program]);

  if (!draft) return <div className="py-12 text-center text-[14px] text-ink-500">Chargement des paramètres…</div>;
  const set = <K extends keyof ProgramSettings>(k: K, v: ProgramSettings[K]) => setDraft({ ...draft, [k]: v });
  const ro = !isAdmin;

  const save = async () => {
    if (!program) return;
    setSaving(true);
    setMsg(null);
    const patch: Partial<ProgramSettings> = {};
    (Object.keys(draft) as (keyof ProgramSettings)[]).forEach((k) => {
      if (JSON.stringify(draft[k]) !== JSON.stringify(program[k])) (patch as Record<string, unknown>)[k] = draft[k];
    });
    try {
      const saved = await api.saveSettings(patch);
      setProgram(saved);
      setDraft(saved);
      store.refreshConfig();
      setMsg({ ok: true, text: 'Paramètres enregistrés.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'Serveur injoignable.' });
    }
    setSaving(false);
  };

  return (
    <>
      <PageHeader
        title="Paramètres"
        subtitle={`Règles du programme Green Housekeeping pour ${store.config?.hotel_name ?? 'l’hôtel'}`}
        actions={
          isAdmin && (
            <>
              <Button size="lg" disabled={!dirty || saving} onClick={() => (setDraft(program), setMsg(null))}>
                Annuler
              </Button>
              <Button size="lg" variant="primary" icon="check" busy={saving} disabled={!dirty} onClick={save}>
                Enregistrer
              </Button>
            </>
          )
        }
      />
      {msg && <div className={cx('rounded-btn px-4 py-3 text-[14px] font-medium', msg.ok ? 'bg-ok-bg text-ok-text' : 'bg-err-bg text-err-text')}>{msg.text}</div>}
      {ro && (
        <div className="flex items-center gap-2 rounded-btn bg-mute-bg px-4 py-3 text-[14px] text-mute-text">
          <Icon name="lock" size={16} /> Seuls les administrateurs de l’équipe peuvent modifier ces réglages.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Sections des paramètres">
          <div className="sticky top-[92px] flex flex-col gap-1">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  history.replaceState(null, '', `#${id}`);
                }}
                className={cx(
                  'rounded-btn px-3 py-2.5 text-[14px] no-underline',
                  active === id ? 'border border-line bg-surface font-semibold text-ink-900 shadow-card' : 'border border-transparent text-ink-700 hover:bg-surface',
                )}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <Section id="regles" title="Règles du programme" sub="Ces règles s'appliquent au bouton en chambre et au tableau de bord.">
            <Row title="Séjour minimum" desc="En dessous, la chambre est « Non éligible » et l'interrupteur est désactivé.">
              <div className="inline-flex items-center overflow-hidden rounded-btn border border-line" role="group" aria-label="Séjour minimum">
                <button type="button" aria-label="Une nuit de moins" disabled={ro || draft.min_nights <= 1} onClick={() => set('min_nights', draft.min_nights - 1)} className="grid h-10 w-10 cursor-pointer place-items-center border-0 bg-surface text-ink-700 disabled:opacity-40">
                  <Icon name="minus" size={16} />
                </button>
                <span className="min-w-[72px] border-x border-line text-center text-[14px] font-semibold text-ink-900">{nightsLabel(draft.min_nights)}</span>
                <button type="button" aria-label="Une nuit de plus" disabled={ro || draft.min_nights >= 14} onClick={() => set('min_nights', draft.min_nights + 1)} className="grid h-10 w-10 cursor-pointer place-items-center border-0 bg-surface text-ink-700 disabled:opacity-40">
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </Row>
            <Row title="Bouton allumé par défaut à l'arrivée" desc="Pour tout séjour éligible, la chambre démarre en « Sans nettoyage ».">
              <Toggle checked={draft.default_on_arrival} disabled={ro} label="Bouton allumé par défaut à l'arrivée" onChange={(v) => set('default_on_arrival', v)} />
            </Row>
            <Row title="Forçage à distance" desc="La gouvernante peut forcer l'état de n'importe quelle chambre pilote.">
              <Toggle checked={draft.staff_force} disabled={ro} label="Forçage à distance" onChange={(v) => set('staff_force', v)} />
            </Row>
            <Row title="Journalisation des changements" desc="Horodatage et attribution : client, gouvernante ou système." last>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-700">
                <Icon name="lock" size={14} className="text-ink-500" /> Toujours active
              </span>
            </Row>
          </Section>

          <Section id="boisson" title="Boisson offerte">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Lieu" htmlFor="drink-place">
                <input id="drink-place" className={inputClass} disabled={ro} value={draft.drink_place} onChange={(e) => set('drink_place', e.target.value)} />
              </Field>
              <Field label="Retrait" htmlFor="drink-pickup">
                <select id="drink-pickup" className={inputClass} disabled={ro} value={draft.drink_pickup} onChange={(e) => set('drink_pickup', e.target.value)}>
                  {[...new Set([draft.drink_pickup, ...PICKUPS])].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Message affiché en chambre (bouton allumé)" htmlFor="drink-msg" hint={`${draft.drink_message.length} / 240 caractères`}>
                <textarea
                  id="drink-msg"
                  rows={2}
                  maxLength={240}
                  disabled={ro}
                  value={draft.drink_message}
                  onChange={(e) => set('drink_message', e.target.value)}
                  className={cx(inputClass, 'h-auto resize-y py-2.5 leading-[1.5]')}
                />
              </Field>
            </div>
            <Row title="Prévenir le bar à chaque renoncement" desc="Prépare la liste des boissons à remettre (Rapports › Boissons à retirer). L'envoi automatique au bar n'est pas encore branché." last>
              <Toggle checked={draft.notify_bar} disabled={ro} label="Prévenir le bar à chaque renoncement" onChange={(v) => set('notify_bar', v)} />
            </Row>
          </Section>

          <PilotRooms readOnly={ro} total={draft.total_rooms} />

          <Section id="ratios" title="Ratios d'impact" sub="Consommation moyenne d'un nettoyage, fournie par l'équipe technique. Utilisée pour estimer l'impact dans Rapports.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <RatioInput label="Eau" unit="L" value={draft.ratio_water_l} disabled={ro} onChange={(v) => set('ratio_water_l', v)} />
              <RatioInput label="Énergie" unit="kWh" value={draft.ratio_energy_kwh} disabled={ro} onChange={(v) => set('ratio_energy_kwh', v)} />
              <RatioInput label="Produits d’entretien" unit="mL" value={draft.ratio_products_ml} disabled={ro} onChange={(v) => set('ratio_products_ml', v)} />
            </div>
          </Section>

          <Section id="notifications" title="Notifications">
            <Row title="Un client demande son nettoyage" desc="Alerte immédiate dans l'application pour réaffecter l'équipe d'étage.">
              <Toggle checked={draft.notify_cleaning_request} disabled={ro} label="Alerte quand un client demande son nettoyage" onChange={(v) => set('notify_cleaning_request', v)} />
            </Row>
            <Row title="Forçage par un autre membre" desc="Quand une chambre est forcée par quelqu'un d'autre que vous.">
              <Toggle checked={draft.notify_force_by_other} disabled={ro} label="Alerte lors d'un forçage par un autre membre" onChange={(v) => set('notify_force_by_other', v)} />
            </Row>
            <Row title="Récapitulatif quotidien par e-mail" desc="Chambres sans nettoyage et boissons à retirer, chaque matin. Sera envoyé dès que la messagerie de l'hôtel sera configurée." last>
              <Toggle checked={draft.daily_email} disabled={ro} label="Récapitulatif quotidien par e-mail" onChange={(v) => set('daily_email', v)} />
            </Row>
          </Section>

          <Team isAdmin={isAdmin} currentId={user?.id ?? -1} />

          <Section id="affichage" title="Affichage">
            <Row title="Langue de l’interface" desc="Le néerlandais et l'anglais arrivent prochainement.">
              <Segmented
                label="Langue de l'interface"
                tone="canvas"
                value="fr"
                onChange={() => undefined}
                options={[
                  { value: 'fr', label: 'Français' },
                  { value: 'nl', label: 'Nederlands', disabled: true, title: 'Bientôt disponible' },
                  { value: 'en', label: 'English', disabled: true, title: 'Bientôt disponible' },
                ]}
              />
            </Row>
            <ThemeRow />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ id, title, sub, right, children }: { id: string; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card className="scroll-mt-[92px] p-6" as="section">
      <div id={id} className="-mt-[92px] pt-[92px]" />
      <div className="mb-2 flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="m-0 text-[20px] font-semibold text-ink-900">{title}</h2>
          {sub && <p className="m-0 mt-1 text-[13px] text-ink-500">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

function Row({ title, desc, children, last }: { title: string; desc?: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-4 py-4', !last && 'border-b border-line')}>
      <div className="min-w-[220px] flex-1">
        <div className="text-[14px] font-semibold text-ink-900">{title}</div>
        {desc && <div className="mt-0.5 text-[13px] text-ink-500">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function RatioInput({ label, unit, value, disabled, onChange }: { label: string; unit: string; value: number | null; disabled: boolean; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));
  useEffect(() => setText(value === null ? '' : String(value).replace('.', ',')), [value]);
  return (
    <Field label={label}>
      <label className="flex h-11 items-center gap-2 rounded-btn border border-line bg-surface px-3 focus-within:border-brand-500">
        <input
          inputMode="decimal"
          aria-label={`${label} par nettoyage (${unit})`}
          placeholder="Non renseigné"
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim().replace(',', '.');
            if (v === '') onChange(null);
            else if (!Number.isNaN(Number(v)) && Number(v) >= 0) onChange(Number(v));
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink-900 outline-none"
        />
        <span className="text-[13px] text-ink-500">{unit}</span>
      </label>
    </Field>
  );
}

function ThemeRow() {
  const theme = useTheme();
  return (
    <Row title="Thème" desc="S'applique à ce poste." last>
      <Segmented<ThemePref>
        label="Thème"
        tone="canvas"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'light', label: 'Clair' },
          { value: 'dark', label: 'Sombre' },
          { value: 'system', label: 'Système' },
        ]}
      />
    </Row>
  );
}

function PilotRooms({ readOnly, total }: { readOnly: boolean; total: number }) {
  const store = useStore();
  const rooms = store.list();
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [type, setType] = useState(ROOM_TYPES[0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = async () => {
    const n = Number(number);
    if (!Number.isInteger(n) || n <= 0) return setMsg({ ok: false, text: 'Numéro de chambre invalide.' });
    try {
      await api.addRoom(n, type);
      setMsg({ ok: true, text: `Chambre ${n} ajoutée au programme (libre, sans séjour).` });
      setNumber('');
    } catch (e) {
      setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'Serveur injoignable.' });
    }
  };
  const remove = async (n: number) => {
    try {
      await api.removeRoom(n);
      setMsg({ ok: true, text: `Chambre ${n} retirée du programme.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof HttpError ? e.message : 'Serveur injoignable.' });
    }
    setSelected(null);
  };

  return (
    <Section
      id="chambres"
      title="Chambres pilotes"
      sub={`${rooms.length} chambres sur ${total} · étages ${floors[0] ?? '—'} à ${floors[floors.length - 1] ?? '—'}`}
      right={
        !readOnly && (
          <Button icon="plus" onClick={() => setAdding((a) => !a)}>
            Ajouter des chambres
          </Button>
        )
      }
    >
      {adding && (
        <div className="mb-3 mt-2 flex flex-wrap items-end gap-3 rounded-[12px] bg-canvas p-3.5">
          <Field label="Numéro" htmlFor="room-new">
            <input id="room-new" inputMode="numeric" className={cx(inputClass, 'w-[120px]')} value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && add()} />
          </Field>
          <Field label="Type" htmlFor="room-type">
            <select id="room-type" className={cx(inputClass, 'w-[200px]')} value={type} onChange={(e) => setType(e.target.value)}>
              {ROOM_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Button variant="primary" onClick={add} disabled={!number}>
            Ajouter
          </Button>
          <span className="pb-2.5 text-[12px] text-ink-500">L'étage est déduit du numéro.</span>
        </div>
      )}
      {msg && <div className={cx('mb-2 mt-2 rounded-btn px-3 py-2 text-[13px] font-medium', msg.ok ? 'bg-ok-bg text-ok-text' : 'bg-err-bg text-err-text')}>{msg.text}</div>}
      <div className="flex flex-col gap-2.5 pt-2">
        {floors.map((f) => (
          <div key={f} className="flex flex-wrap items-center gap-2">
            <span className="w-[72px] text-[13px] text-ink-500">Étage {f}</span>
            {rooms
              .filter((r) => r.floor === f)
              .map((r) => (
                <span key={r.number} className="relative">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => setSelected(selected === r.number ? null : r.number)}
                    title={r.room_type}
                    className={cx(
                      'h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold tabular-nums text-ink-900 disabled:cursor-default',
                      selected === r.number ? 'border-brand-500 bg-brand-100' : 'border-transparent bg-canvas',
                    )}
                  >
                    {r.number}
                  </button>
                  {selected === r.number && (
                    <span className="absolute left-0 top-[calc(100%+6px)] z-20 flex w-max items-center gap-2 rounded-[12px] border border-line bg-surface p-2 text-[13px] shadow-pop">
                      <span className="px-1 text-ink-700">{r.room_type}</span>
                      <Button size="sm" variant="danger" icon="trash" onClick={() => remove(r.number)}>
                        Retirer
                      </Button>
                    </span>
                  )}
                </span>
              ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Team({ isAdmin, currentId }: { isAdmin: boolean; currentId: number }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [invite, setInvite] = useState(false);
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => api.users().then(setUsers, () => setUsers([]));
  useEffect(() => {
    void reload();
  }, []);

  const reset = async (u: User) => {
    try {
      const r = await api.patchUser(u.id, { reset_password: true });
      setSecret({ name: u.name, email: u.email, password: r.temporary_password ?? '' });
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Serveur injoignable.');
    }
  };
  const remove = async (u: User) => {
    if (!window.confirm(`Retirer ${u.name} de l’équipe ? Sa session sera fermée.`)) return;
    try {
      await api.deleteUser(u.id);
      void reload();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Serveur injoignable.');
    }
  };

  return (
    <Section
      id="equipe"
      title="Équipe et rôles"
      right={
        isAdmin && (
          <Button icon="mail" onClick={() => setInvite(true)}>
            Inviter un membre
          </Button>
        )
      }
    >
      {error && <div className="mb-2 mt-2 rounded-btn bg-err-bg px-3 py-2 text-[13px] font-medium text-err-text">{error}</div>}
      <div className="flex flex-col gap-2.5 pt-2">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line p-3">
            <Avatar name={u.name} size={36} />
            <div className="flex min-w-[160px] flex-1 flex-col leading-[1.35]">
              <span className="text-[14px] font-semibold text-ink-900">
                {u.name}
                {u.id === currentId && <span className="ml-1.5 text-[12px] font-normal text-ink-500">(vous)</span>}
              </span>
              <span className="text-[12px] text-ink-500">
                {u.title} · {u.email}
              </span>
            </div>
            <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-700">{u.role === 'admin' ? 'Administration · peut forcer' : 'Équipe · peut forcer'}</span>
            {isAdmin && u.id !== currentId && (
              <div className="flex gap-2">
                <Button size="sm" icon="key" onClick={() => reset(u)}>
                  Nouveau mot de passe
                </Button>
                <Button size="sm" variant="danger" icon="trash" onClick={() => remove(u)} aria-label={`Retirer ${u.name}`}>
                  Retirer
                </Button>
              </div>
            )}
          </div>
        ))}
        {users === null && <div className="text-[13px] text-ink-500">Chargement…</div>}
      </div>
      <InviteDialog
        open={invite}
        onClose={() => setInvite(false)}
        onCreated={(u) => {
          setInvite(false);
          setSecret({ name: u.name, email: u.email, password: u.temporary_password ?? '' });
          void reload();
        }}
      />
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Mot de passe provisoire" footer={<Button variant="primary" onClick={() => setSecret(null)}>J’ai noté le mot de passe</Button>}>
        {secret && (
          <div className="flex flex-col gap-3 text-[14px] leading-[1.5] text-ink-700">
            <p className="m-0">
              Transmettez ces identifiants à <strong className="text-ink-900">{secret.name}</strong>. Le mot de passe ne sera plus affiché ; il pourra être changé depuis le menu du profil.
            </p>
            <div className="rounded-[12px] bg-canvas p-4 font-mono text-[14px] text-ink-900">
              <div>{secret.email}</div>
              <div className="mt-1 text-[18px] font-semibold tracking-[.04em]">{secret.password}</div>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}

function InviteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('Gouvernante d’étage');
  const [role, setRole] = useState<User['role']>('member');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.invite({ name, email, title, role }));
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Serveur injoignable.');
    }
    setBusy(false);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inviter un membre"
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" busy={busy} disabled={!name.trim() || !email.includes('@')} onClick={submit}>
            Créer le compte
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nom" htmlFor="inv-name">
          <input id="inv-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Adresse e-mail professionnelle" htmlFor="inv-email">
          <input id="inv-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@thehotel.be" />
        </Field>
        <Field label="Fonction" htmlFor="inv-title">
          <input id="inv-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">Rôle</span>
          <Segmented
            label="Rôle"
            tone="canvas"
            value={role}
            onChange={setRole}
            options={[
              { value: 'member', label: 'Équipe · peut forcer' },
              { value: 'admin', label: 'Administration' },
            ]}
          />
        </div>
        <p className="m-0 text-[13px] text-ink-500">Un mot de passe provisoire sera généré et affiché une seule fois. L'envoi d'invitations par e-mail sera activé avec la messagerie de l'hôtel.</p>
        {error && <div className="rounded-btn bg-err-bg px-3 py-2 text-[13px] font-medium text-err-text">{error}</div>}
      </div>
    </Modal>
  );
}
