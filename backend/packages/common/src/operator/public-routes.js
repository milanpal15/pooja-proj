// COPIED from pooja-api/src/middleware/access.js `PUBLIC`. access-parity.test.mjs fails when the two drift.
/**
 * The endpoints the PHONE APP needs without an operator session; everything else under /api needs one. The admin BFF
 * (which owns the operator session) forwards these to the monolith WITHOUT demanding a cookie; any other path needs a
 * session first. Fail closed: a route not listed here is private.
 *
 * Paths are as the gate sees them, i.e. without the `/api` prefix.
 */
export const PUBLIC = [
  // Liveness, for the host's health check.
  { method: 'GET', path: /^\/health$/ },

  // Feature flags and content the app reads on launch.
  { method: 'GET', path: /^\/flags$/ },
  { method: 'GET', path: /^\/content$/ },
  { method: 'GET', path: /^\/horoscope$/ },
  { method: 'GET', path: /^\/panchang$/ },
  { method: 'GET', path: /^\/announcements$/ },
  { method: 'GET', path: /^\/policy\/[^/]+$/ },

  // Live darshan: list and player are open; saying Jai verifies a Firebase token inside the route.
  { method: 'GET', path: /^\/live$/ },
  { method: 'GET', path: /^\/live\/[^/]+$/ },
  { method: 'POST', path: /^\/live\/[^/]+\/jai$/ },

  // Written by the app, not by a person at a keyboard.
  { method: 'POST', path: /^\/policy\/[^/]+\/accept$/ },
  { method: 'POST', path: /^\/ingest\/(session|screen)$/ },
  { method: 'POST', path: /^\/push\/register$/ },

  // The session endpoints themselves, or you could never sign in.
  { method: 'POST', path: /^\/admin\/login$/ },
  { method: 'POST', path: /^\/admin\/logout$/ },
  { method: 'GET', path: /^\/admin\/session$/ },
];

export const isPublic = (method, path) => PUBLIC.some((r) => r.method === method && r.path.test(path));
