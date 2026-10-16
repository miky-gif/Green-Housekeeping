import { useEffect, type ReactNode } from 'react';
import AppShell from './components/AppShell';
import { Spinner } from './components/Icons';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Login from './pages/Login';
import Reports from './pages/Reports';
import RoomButton from './pages/RoomButton';
import Rooms from './pages/Rooms';
import Settings from './pages/Settings';
import { navigate, usePath } from './lib/nav';
import { useSession } from './lib/session';
import { store } from './lib/store';

const STAFF_PAGES: Record<string, () => ReactNode> = {
  '/dashboard': () => <Dashboard />,
  '/dashboard/chambres': () => <Rooms />,
  '/dashboard/historique': () => <History />,
  '/dashboard/rapports': () => <Reports />,
  '/dashboard/parametres': () => <Settings />,
};

export default function App() {
  const path = usePath().replace(/\/+$/, '') || '/';
  const session = useSession();

  useEffect(() => {
    store.start();
    void session.load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Écran public : le bouton en chambre (l'appareil de la chambre n'a pas de compte).
  const roomMatch = path.match(/^\/chambre\/(\d+)$/);
  if (roomMatch) return <RoomButton number={Number(roomMatch[1])} />;
  if (path === '/connexion') return <Login />;

  // Espace équipe : connexion requise.
  const page = STAFF_PAGES[path];
  if (!page) return <Redirect to="/dashboard" />;
  if (session.user === undefined) return <FullscreenLoader />;
  if (session.user === null) return <Redirect to={`/connexion?suite=${encodeURIComponent(path + location.search)}`} />;
  return <AppShell>{page()}</AppShell>;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]);
  return null;
}

function FullscreenLoader() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-canvas text-ink-500">
      <Spinner size={24} />
    </div>
  );
}
