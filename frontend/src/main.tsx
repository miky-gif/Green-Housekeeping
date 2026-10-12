import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Archivo, variable en graisse (100–900) et en largeur (62–125 %), embarquée : aucune requête Internet.
import '@fontsource-variable/archivo/wdth.css';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
