import { useState } from 'react';
import { qrSrc } from '../lib/api';
import { store } from '../lib/store';
import { ExternalIcon } from './Hotel';
import { ChevronIcon, ResetIcon } from './Icons';

const KEY = 'gh.demoBar';

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'collapsed';
  } catch {
    return true;
  }
}

/**
 * Barre de démonstration (maquette C) : violet rayé, identique en clair et en
 * sombre, pour ne jamais se confondre avec l'interface réelle. Elle n'existe
 * qu'en mode démo (GH_MODE=demo) et ne contient que des outils de démo.
 */
export default function DemoBar({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(readOpen);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const simulatorUrl = `${location.origin}/chambres`;

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? 'collapsed' : 'open');
      } catch {
        /* stockage indisponible : sans conséquence */
      }
      return !o;
    });
  };

  const reset = async () => {
    setBusy(true);
    await store.reset();
    setBusy(false);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Ouvrir la barre de démonstration"
        className="absolute bottom-5 left-4 z-[3] flex h-10 cursor-pointer items-center gap-2.5 rounded-full border-[1.5px] border-dashed border-demo-line bg-demo-bg pl-1.5 pr-3.5 text-[14px] font-medium text-demo-ink sm:left-6"
        style={{ boxShadow: '0 8px 24px rgba(20,16,50,.3)' }}
      >
        <span className="rounded-full bg-demo-accent px-2 py-1 font-mono text-[11px] uppercase tracking-[.08em] text-demo-accent-ink">Démo</span>
        Barre de démonstration
        <ChevronIcon size={14} up />
      </button>
    );

  const ghost =
    'flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-sg-sm border border-[rgba(238,234,254,.35)] bg-transparent px-3.5 text-[14px] font-medium text-demo-ink no-underline disabled:opacity-60';

  return (
    <div
      role="region"
      aria-label="Barre de démonstration"
      className="sg-demo-stripes absolute bottom-5 left-4 right-4 z-[3] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-sg-lg border-[1.5px] border-dashed border-demo-line py-3 pl-3.5 pr-3 text-demo-ink sm:left-6 sm:right-6"
      style={{ boxShadow: '0 12px 32px rgba(20,16,50,.35)' }}
    >
      <span className="whitespace-nowrap rounded-sg-xs bg-demo-accent px-[9px] py-[5px] font-mono text-[12px] font-medium uppercase tracking-[.08em] text-demo-accent-ink">
        Démo · hors production
      </span>
      {compact ? (
        <span className="flex-1" />
      ) : (
        <span className="min-w-[220px] flex-1 text-[14px] leading-[1.35] text-demo-ink/85">
          Données fictives. Pour jouer le client, ouvrez le simulateur sur un téléphone.
        </span>
      )}
      <div className="relative">
        <button type="button" className={ghost} onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          QR téléphone
        </button>
        {showQr && (
          <div className="absolute bottom-[calc(100%+12px)] right-0 w-[220px] rounded-sg-md border border-demo-line bg-demo-bg p-3 text-center text-[13px] leading-[1.35] shadow-sg">
            <img src={qrSrc(simulatorUrl)} alt="QR code du simulateur client" width={180} height={180} className="mx-auto rounded-sg-sm bg-white p-1" />
            <div className="mt-2">Scannez pour ouvrir le simulateur client sur un téléphone.</div>
          </div>
        )}
      </div>
      <a href="/chambres" target="_blank" rel="noopener" className={ghost}>
        Simulateur client
        <ExternalIcon />
      </a>
      <button type="button" onClick={reset} disabled={busy} className={ghost}>
        <ResetIcon />
        {busy ? 'Réinitialisation…' : 'Réinitialiser la démo'}
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label="Replier la barre de démonstration"
        className="grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-sg-sm border border-[rgba(238,234,254,.35)] bg-transparent text-demo-ink"
      >
        <ChevronIcon />
      </button>
    </div>
  );
}
