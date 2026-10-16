import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Plus Jakarta Sans (police de la maquette), variable 200–800, embarquée : aucune requête Internet.
import '@fontsource-variable/plus-jakarta-sans/index.css';
import './index.css';
import App from './App';
import { applyTheme } from './lib/theme';

applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
