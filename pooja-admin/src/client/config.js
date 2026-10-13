/**
 * The ONE place the dashboard reads its environment (`VITE_*`, set in `.env` or the build's
 * environment; see `.env.example`). Import from here; nothing else touches `import.meta.env`.
 *
 * `VITE_*` values are baked into the static bundle at BUILD time and are visible to anyone who opens
 * the site, so NOTHING secret belongs here — the dashboard's only setting is where the API lives.
 * Changing it is a rebuild, not a restart. (The dev server's `API_ORIGIN` proxy target is read by
 * `vite.config.js`, which runs before the app exists and so cannot import this.)
 */

/*
 * Where the API lives.
 *
 * Empty means same-origin, which is right in dev: Vite proxies /api and /uploads to a local API,
 * so the browser sees one origin.
 *
 * In production the dashboard is a static site and the API is a separate service, so the build
 * needs VITE_API_BASE. Without it the dashboard will call itself and every request 404s — see
 * pooja-admin/README.md.
 */
function normaliseBase(raw) {
  // Empty stays empty: that is same-origin, which is what dev wants.
  if (!raw) return '';
  // Render's blueprint can only pass the API's HOST, with no scheme. Left as-is that is a relative
  // path, so every call would hit this site instead of the API and 404 against the SPA fallback.
  const absolute = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  // `${API_BASE}/api` would otherwise become `//api` and lose the path.
  return absolute.replace(/\/+$/, '');
}

export const API_BASE = normaliseBase(import.meta.env.VITE_API_BASE);
