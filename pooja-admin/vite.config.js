import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The dashboard is a static site that talks to `pooja-api`.
 *
 * It used to be served by that same Express process, so `/api/...` was
 * same-origin and needed no base URL. The API is its own service now — the
 * phone app's backend should not be a subfolder of the admin tool — so the
 * built bundle needs to know where it lives:
 *
 *   VITE_API_BASE=https://pooja-api.onrender.com npm run build
 *
 * In dev that is unnecessary: Vite proxies /api and /uploads to a local API
 * on :4000, so the browser still sees one origin and no CORS.
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
