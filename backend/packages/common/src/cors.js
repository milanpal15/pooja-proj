/**
 * The CORS policy — copied from pooja-api/src/config/cors.js (do not weaken).
 * Never reflect an arbitrary origin AND allow credentials in production.
 */
import cors from 'cors';

export function allowedOrigins(raw) {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`))
    .map((o) => o.replace(/\/+$/, ''));
}

export function corsMiddleware({ corsOrigin, isProduction, logger }) {
  const reflectsAnyOrigin = corsOrigin === '*';
  const allowCredentials = !(reflectsAnyOrigin && isProduction);
  if (!allowCredentials) {
    (logger?.error || console.error)(
      "CORS_ORIGIN is '*' in production, so credentialed cross-origin requests are being REFUSED - the dashboard cannot sign in. Set CORS_ORIGIN to the dashboard's exact URL.",
    );
  }
  return cors({
    origin: reflectsAnyOrigin ? true : allowedOrigins(corsOrigin),
    credentials: allowCredentials,
  });
}
