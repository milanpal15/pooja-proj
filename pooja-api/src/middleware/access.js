import { config } from '../config/env.js';
import { areaFor } from '../access/routes.js';
import { hasPermission, permissionsFor } from '../access/permissions.js';
import { Operator } from '../models.js';
import { authRequired } from '../modules/operators/operators.service.js';
import { sessionOf } from '../modules/operators/session.js';

/**
 * The gate in front of the dashboard, and who is allowed through which part.
 *
 * Until this existed every route was open. On localhost that was merely
 * untidy; on a public URL it meant anyone who found the address could
 * rewrite the prices and **delete devotees** — which deletes their Firebase
 * accounts too.
 *
 * ── Fail closed ────────────────────────────────────────────────────────
 *
 * `PUBLIC` names the endpoints the PHONE APP needs. Everything else under
 * /api requires a signed-in operator. That direction matters: a route added
 * later is protected because nobody remembered to protect it, rather than
 * exposed because nobody remembered to.
 *
 * ── Three roles, many areas ────────────────────────────────────────────
 *
 * `admin`, `editor` and `viewer` are sets of `<area>:view|edit` permissions
 * (access/permissions.js). Which area a path belongs to is ONE table
 * (access/routes.js); a path with no entry is admin-only. See DESIGN.md §21.
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

/* ────────────────────────────────────────────────────────────────── guard ── */

const FORBIDDEN = "You don't have permission for that.";
const forbid = (res, needs) => res.status(403).json({ error: FORBIDDEN, code: 'forbidden', needs });

/** Mount with `app.use('/api', requireAdmin)` BEFORE the routers. */
export async function requireAdmin(req, res, next) {
  if (PUBLIC.some((r) => r.method === req.method && r.path.test(req.path))) return next();

  // No operators at all means a local dev database nobody has set up; the
  // warning on boot covers it.
  //
  // Production never opens, even now: the boot-time refusal only guards the
  // moment the server starts, and a restored backup or a hand-edit that leaves
  // no active operator would otherwise leave the whole admin API open until the
  // next restart.
  if (!(await authRequired())) {
    if (config.isProduction) {
      return res.status(503).json({ error: 'The dashboard is locked: no active operator exists.', code: 'no_operators' });
    }
    req.can = () => true;
    return next();
  }

  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'Sign in required' });

  // Role and permissions come from the record on EVERY request, never from
  // the cookie: a demotion takes effect on the next call.
  const operator = await Operator.findById(s.uid).lean();
  if (!operator || !operator.active) {
    return res.status(401).json({ error: 'Sign in required' });
  }

  const permissions = permissionsFor(operator.role);
  req.operator = { id: String(operator._id), username: operator.username, role: operator.role, permissions };
  req.can = (perm) => hasPermission(permissions, perm);

  const { area, level, also } = areaFor(req.method, req.path);
  const needs = `${area}:${level}`;
  if (!req.can(needs)) return forbid(res, needs);
  if (also && !req.can(also)) return forbid(res, also);
  next();
}
