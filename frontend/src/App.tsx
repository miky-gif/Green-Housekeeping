import { useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import RoomButton from './pages/RoomButton';
import Simulator from './pages/Simulator';
import { navigate, usePath } from './lib/nav';
import { store, useStore } from './lib/store';

export default function App() {
  const path = usePath();
  const { config } = useStore();

  useEffect(() => {
    store.start();
  }, []);

  const match = path.match(/^\/chambre\/(\d+)\/?$/);
  const roomNo = match ? Number(match[1]) : null;
  const isDashboard = /^\/dashboard\/?$/.test(path);
  // Le simulateur client n'existe qu'en mode démo.
  const isSimulator = /^\/chambres\/?$/.test(path) && config?.mode !== 'production';

  useEffect(() => {
    if (roomNo === null && !isDashboard && !isSimulator) navigate('/dashboard', true);
  }, [roomNo, isDashboard, isSimulator]);

  if (roomNo !== null) return <RoomButton number={roomNo} />;
  if (isSimulator) return <Simulator />;
  return <Dashboard />;
}
