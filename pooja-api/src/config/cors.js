import cors from 'cors';

import { config } from './env.js';

/**
 * The dashboard origins allowed to call this.
 *
 * An `Origin` header is scheme + host, and `cors` compares it as a plain
 * string, so two near-misses fail silently and identically — every call
 * refused, nothing logged:
 *   - a bare host, which is all Render's blueprint can hand over
 *     (`fromService` yields `pooja-admin.onrender.com`, no scheme);
 *   - a trailing slash, which is what you get from copying the URL out of
 *     the browser's address bar.
 * Both are normalised here rather than left for someone to debug.
 */
export function allowedOrigins(raw) {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`))
    .map((o) => o.replace(/\/+$/, ''));
}

/**
 * The `cors` middleware for this deployment, with the credentialed-CORS rule
 * applied. Logs once, loudly, when it has to withhold credentials.
 */
export function corsMiddleware() {
  const CORS_ORIGIN = config.corsOrigin;
  /*
   * The dashboard is a separate origin now, so `credentials` is load-bearing
   * rather than incidental: without it the browser will not send the admin
   * session cookie to this host at all.
   *
   * Which also means CORS_ORIGIN can no longer be '*' in production — the
   * spec forbids a wildcard origin on a credentialed request, and the browser
   * will refuse every dashboard call. Set it to the dashboard's URL.
   *
   * A reflected origin and `credentials` must never ship together.
   *
   * `origin: true` echoes whatever Origin asked, which is convenient in dev.
   * In production it is a hole: the admin session is a cookie, and
   * SESSION_SAMESITE=None — required, because the dashboard is a separate
   * site — means the browser SENDS that cookie cross-site. Echo the origin
   * back with `Access-Control-Allow-Credentials: true` and any page an
   * operator visits while signed in can read and write the admin API as
   * them: list devotees, edit content, delete accounts.
   *
   * Found live: production had CORS_ORIGIN unset, so it defaulted to '*' and
   * answered `Access-Control-Allow-Origin: https://evil.example.com`.
   *
   * Refusing to boot would take the phone app down too, over a hole that
   * only reaches the admin surface — so instead the credential is withheld.
   * Public content keeps serving; the dashboard stops working until
   * CORS_ORIGIN names it, which is the right pressure and is visible.
   */
  const reflectsAnyOrigin = CORS_ORIGIN === '*';
  const inProduction = config.isProduction;
  const allowCredentials = !(reflectsAnyOrigin && inProduction);

  if (!allowCredentials) {
    console.error(
      '✗ CORS_ORIGIN is \'*\' in production, so credentialed cross-origin\n' +
        '  requests are being REFUSED — the dashboard cannot sign in.\n' +
        '  Set CORS_ORIGIN to the dashboard\'s URL (e.g. https://pooja-admin.onrender.com).',
    );
  }

  return cors({
    origin: reflectsAnyOrigin ? true : allowedOrigins(CORS_ORIGIN),
    credentials: allowCredentials,
  });
}
