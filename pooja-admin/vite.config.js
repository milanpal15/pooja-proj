import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The dashboard and the API are one app now.
 *
 * Express serves `dist/` in production, so the client calls `/api/...` on its
 * own origin and never needs an absolute URL. In dev, Vite runs alongside for
 * hot reload and proxies those same paths to the API — one code path for
 * both, no VITE_API_BASE, and no CORS between two localhost ports.
 */
export default defineConfig({
  root: '.',
  build: { outDir: 'dist' },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_ORIGIN || 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: process.env.API_ORIGIN || 'http://localhost:4000', changeOrigin: true },
    },
  },
});
