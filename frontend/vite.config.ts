import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, Vite relaie /api et /ws vers FastAPI : le navigateur parle toujours
// à la même origine que la page, en local comme sur le téléphone.
const backend = process.env.GH_BACKEND ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: { target: 'es2020', sourcemap: false },
});
