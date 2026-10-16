import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icons';
import { Button, cx, Modal } from '../components/ui';
import { HttpError } from '../lib/api';
import { navigate, useQuery } from '../lib/nav';
import { useSession } from '../lib/session';
import { useStore } from '../lib/store';

/** Connexion de l'équipe — maquettes c1 à c4. */
export default function Login() {
  const session = useSession();
  const store = useStore();
  const query = useQuery();
  const config = store.config;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'privacy' | 'help'>(null);
  const next = query.get('suite') || '/dashboard';

  useEffect(() => {
    document.title = `Connexion · GreenKeeping`;
  }, []);
  useEffect(() => {
    if (session.user) navigate(next.startsWith('/') ? next : '/dashboard', true);
  }, [session.user, next]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await session.login(email, password, remember);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Serveur injoignable. Vérifiez la connexion puis réessayez.');
    }
    setBusy(false);
  };

  const hotel = config?.hotel_name ?? 'The Hotel Brussels';

  return (
    <div className="grid min-h-[100dvh] bg-surface lg:grid-cols-2">
      <div className="flex min-h-[100dvh] flex-col px-6 py-8 sm:px-14 sm:py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-btn bg-brand-500 text-[18px] font-bold text-white">G</span>
            <span className="text-[16px] font-bold tracking-[-.01em] text-ink-900">GreenKeeping</span>
          </div>
          <span className="flex h-10 items-center gap-1 rounded-btn border border-line px-3 text-[13px] font-semibold text-ink-700" title="Français (néerlandais et anglais bientôt)">
            FR <Icon name="chevronDown" size={15} />
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-500">{hotel} · Espace équipe</span>
          <h1 className="m-0 mt-2 text-[32px] font-bold tracking-[-.02em] text-ink-900">Connexion</h1>
          <p className="m-0 mt-2 text-[14px] leading-[1.6] text-ink-700">Accédez au suivi Green Housekeeping des chambres pilotes.</p>

          {config?.setup_required && (
            <div role="status" className="mt-5 flex items-start gap-2.5 rounded-btn bg-warn-bg px-4 py-3 text-[13px] font-medium leading-[1.5] text-warn-text">
              <Icon name="alert" size={17} className="mt-0.5" />
              <span>
                Aucun compte n’a encore été créé. La personne qui installe GreenKeeping crée le premier administrateur avec la commande{' '}
                <code className="font-mono">python run.py --create-admin</code>.
              </span>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-btn bg-err-bg px-4 py-3 text-[13px] font-medium leading-[1.5] text-err-text">
              <Icon name="alert" size={17} className="mt-0.5" />
              {error}
            </div>
          )}
          {info && (
            <div role="status" className="mt-5 flex items-start gap-2.5 rounded-btn bg-info-bg px-4 py-3 text-[13px] font-medium leading-[1.5] text-info-text">
              <Icon name="alert" size={17} className="mt-0.5" />
              {info}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-[13px] font-semibold text-ink-900">
                Adresse e-mail professionnelle
              </label>
              <span className={cx('flex h-12 items-center gap-2.5 rounded-btn border bg-surface px-3.5', error ? 'border-err-text' : 'border-line focus-within:border-brand-500')}>
                <Icon name="mail" size={18} className="text-ink-300" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="prenom.nom@thehotel.be"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink-900 outline-none"
                />
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[13px] font-semibold text-ink-900">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => (setError(null), setInfo('Demandez à la gouvernante générale de vous attribuer un nouveau mot de passe depuis Paramètres › Équipe et rôles.'))}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-brand-600 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <span className={cx('flex h-12 items-center gap-2.5 rounded-btn border bg-surface px-3.5', error ? 'border-err-text' : 'border-line focus-within:border-brand-500')}>
                <Icon name="lock" size={18} className="text-ink-300" />
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink-900 outline-none"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ink-700" aria-pressed={show}>
                  {show ? 'Masquer' : 'Afficher'}
                </button>
              </span>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-ink-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-[18px] w-[18px] cursor-pointer accent-[var(--orange-500)]" />
              Rester connecté·e sur ce poste
            </label>
            <Button type="submit" variant="primary" size="lg" className="mt-1 h-12 w-full" busy={busy} disabled={busy || !email || !password}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>

          <p className="m-0 mt-6 text-[13px] leading-[1.6] text-ink-500">Accès réservé au personnel. Pas encore de compte ? Demandez une invitation à la gouvernante générale.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-500">
          <span>
            {hotel}
            {hotel === 'The Hotel Brussels' ? ' · Boulevard de Waterloo 38, 1000 Bruxelles' : ''}
          </span>
          <span className="flex gap-4">
            <button type="button" onClick={() => setDialog('privacy')} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-500 hover:text-ink-900">
              Confidentialité
            </button>
            <button type="button" onClick={() => setDialog('help')} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-ink-500 hover:text-ink-900">
              Aide
            </button>
          </span>
        </div>
      </div>

      <div className="hidden flex-col items-center justify-center gap-8 bg-brand-50 px-12 py-16 text-center lg:flex">
        <span className="grid h-[200px] w-[200px] place-items-center rounded-full bg-brand-500 text-white gk-breath">
          <Icon name="power" size={64} stroke={1.8} />
        </span>
        <div className="flex max-w-[440px] flex-col gap-4">
          <h2 className="m-0 text-[28px] font-bold leading-[1.25] tracking-[-.02em] text-ink-900">Un bouton en chambre, une boisson offerte au Iris</h2>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-700">
            Le client renonce au nettoyage quotidien d'un geste. Vous supervisez chaque chambre et pouvez forcer son état à distance.
          </p>
        </div>
        <div className="flex w-full max-w-[420px] flex-col gap-2.5">
          {[
            ['var(--ok-dot)', 'Bouton allumé : pas de nettoyage aujourd’hui'],
            ['var(--info-dot)', 'Bouton éteint : nettoyage normal'],
            ['var(--mute-dot)', 'Séjour d’une nuit : option non éligible'],
          ].map(([c, t]) => (
            <div key={t} className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 text-left text-[13px] text-ink-700">
              <span className="h-2 w-2 flex-none rounded-full" style={{ background: c }} />
              {t}
            </div>
          ))}
        </div>
        <div className="flex gap-2.5">
          {[
            ['award', 'Green Key'],
            ['building', 'BREEAM'],
          ].map(([icon, label]) => (
            <span key={label} className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-ink-700">
              <Icon name={icon as 'award' | 'building'} size={14} className="text-ok-text" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <Modal open={dialog === 'privacy'} onClose={() => setDialog(null)} title="Confidentialité">
        <p className="m-0 text-[14px] leading-[1.6] text-ink-700">
          GreenKeeping ne traite aucune donnée personnelle des clients : seulement les numéros de chambre, la durée des séjours et l’état du bouton. Chaque changement est horodaté et attribué au client,
          au système ou au membre de l’équipe qui l’a fait.
        </p>
      </Modal>
      <Modal open={dialog === 'help'} onClose={() => setDialog(null)} title="Aide">
        <p className="m-0 text-[14px] leading-[1.6] text-ink-700">
          Pour obtenir un compte ou un nouveau mot de passe, adressez-vous à la gouvernante générale. Pour une question sur le programme, contactez l’équipe SunyGreen.
        </p>
      </Modal>
    </div>
  );
}
