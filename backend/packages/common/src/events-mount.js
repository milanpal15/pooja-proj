/**
 * Everything a BFF needs to put the events service behind its `/api` surface (docs/EVENTS.md), in one call, so the mobile and admin
 * BFFs cannot drift:
 *
 *   - MOBILE BFF: `GET /api/events` and `GET /api/events/:slug` (published events only). Firebase-OPTIONAL like the catalog's public
 *     routes: a guest is served, a signed-in devotee's uid rides as the token's `sub` (their sections, progress and `me` come back).
 *     Stale-while-error up to 10 minutes (`x-degraded: events`) - for ANONYMOUS reads only, so one devotee's answer can never be served
 *     to another. Plus the devotee's own routes behind the Firebase edge (401 without a token): `POST /api/events/:slug/join`, `.../leave`,
 *     `.../milestones/:mKey/tasks/:tKey/progress`, `GET /api/me/events`, `GET /api/me/badges`.
 *   - ADMIN BFF: the operator routes (events, event types, badges, task kinds, stats, participants) behind the area gate, audited.
 *
 * Events unreachable: `503 {error:'events_unavailable', code:'events_unavailable'}`. Events' own answers (400 bad_event + fields,
 * 404, 409 in_use, 503 catalog_unavailable) pass through unchanged.
 *
 * Returns `null` when EVENTS_URL is unset: the BFF then serves nothing of this (the paths fall through to the monolith, which has no events).
 */
import express from 'express';

import { createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { probeUpstream } from './proxy.js';
import { EVENTS_ADMIN_ROUTES, EVENTS_DEVOTEE_ROUTES, EVENTS_PUBLIC_GETS } from './events-routes.js';

export const EVENTS_NS = '/internal/events';
export const EVENTS_STALE_MS = 10 * 60_000;
const UNAVAILABLE = { error: 'events_unavailable', code: 'events_unavailable' };
const UNREACHABLE = new Set(['upstream_unavailable', 'upstream_timeout', 'circuit_open', 'service_unavailable', 'internal']);

const stringQuery = (q) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => typeof v === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** True when events ANSWERED (worth relaying: 4xx, or a coded 503 such as catalog_unavailable) rather than being unreachable. */
const answered = (e) => e instanceof ServiceError && e.status !== 401 && (e.status < 500 || (e.body?.code && !UNREACHABLE.has(e.body.code)));

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {{eventsUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, monolithUrl:string}} config
 * @param {object} [o]
 * @param {false|{sessions:object, audit:Function}} [o.operator]  `false` = serves no operator routes (mobile); `{sessions, audit}` = identity-backed; omitted = legacy
 * @param {{requireDevotee:Function, asDevotee:Function}|null} [o.devotee]  the mobile BFF's identity edge (optional here: a guest is fine)
 */
export function createEventsMount(iss, config, { logger, fetchImpl, operator, devotee = null, now = () => Date.now() } = {}) {
  if (!config.eventsUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const secret = config.internalJwtSecret;
  // `codedErrorsAreAnswers`: publishing answers `503 catalog_unavailable` when ITS dependency is down - an answer, not a sick events service.
  const client = createServiceClient({ service: 'events', baseUrl: config.eventsUrl, iss, secret, timeoutMs: config.serviceTimeoutMs, codedErrorsAreAnswers: true, ...extra });

  const legacy = operator === undefined;
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({ iss, monolithUrl: config.monolithUrl, logger, signToken: (claims) => signServiceToken(claims, { secret }), ...extra })
    : operator?.audit;

  const lastGood = new Map();

  function relayError(res, e, what) {
    if (answered(e)) return res.status(e.status).json(e.body);
    if (e instanceof ServiceError && e.status === 401) {
      logger?.error(`events rejected this BFF's service token (${what}): INTERNAL_JWT_SECRET mismatch?`);
      return res.status(502).json({ error: 'upstream_unavailable', code: 'events_auth_failed' });
    }
    logger?.warn(`events ${what} unavailable: ${e?.code || e?.message}`);
    return res.status(503).json(UNAVAILABLE);
  }

  function mountPublic(app) {
    const router = express.Router();
    for (const { path, to, maxStaleMs } of EVENTS_PUBLIC_GETS) {
      router.get(`/api${path}`, async (req, res) => {
        // A signed-in devotee is forwarded as the token's `sub`; an invalid or absent token is simply a guest.
        const a = req.deviceAuth;
        const as = devotee && a && !a.error && a.uid ? devotee.asDevotee(a) : undefined;
        const key = req.originalUrl;
        try {
          const target = to.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
          const body = await client.get(`${EVENTS_NS}${target}`, { reqId: req.id, query: stringQuery(req.query), ...(as ? { as } : {}) });
          if (!as) {
            if (lastGood.size >= 300) lastGood.delete(lastGood.keys().next().value);
            lastGood.set(key, { at: now(), body });
          }
          res.json(body);
        } catch (e) {
          if (answered(e)) return res.status(e.status).json(e.body);
          const hit = !as && lastGood.get(key);
          if (hit && now() - hit.at < maxStaleMs && !(e instanceof ServiceError && e.status === 401)) {
            logger?.warn(`events ${path} degraded: ${e?.code || e?.message}`);
            res.setHeader('x-degraded', 'events');
            return res.json(hit.body);
          }
          relayError(res, e, path);
        }
      });
    }

    // The devotee's own routes: a verified Firebase uid is required (401 / 403 / 503 exactly as the other devotee routes answer), then events'
    // status and body go back unchanged. Nothing here is retried (the shared client retries idempotent GETs only; join / progress are
    // idempotent on events' side, so the app's own retry is safe).
    if (devotee) {
      const json = express.json({ limit: '32kb' });
      for (const r of EVENTS_DEVOTEE_ROUTES) {
        const method = r.method.toLowerCase();
        router[method](`/api${r.path}`, devotee.requireDevotee, ...(method === 'get' ? [] : [json]), async (req, res) => {
          try {
            const to = r.to.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
            const opts = { reqId: req.id, as: devotee.asDevotee(req.deviceAuth), full: true };
            const out = method === 'get'
              ? await client.request('GET', `${EVENTS_NS}${to}`, { ...opts, query: stringQuery(req.query) })
              : await client.request(r.method, `${EVENTS_NS}${to}`, { ...opts, body: req.body ?? {} });
            if (out.status === 204 || out.data === null) return res.status(out.status).end();
            res.status(out.status).json(out.data);
          } catch (e) { relayError(res, e, r.path); }
        });
      }
    }
    app.use(router);
  }

  function mountOperator(app) {
    if (operator === false) return;
    app.use(engagementAdminRouter({ sessions, client, audit, routes: EVENTS_ADMIN_ROUTES, namespace: EVENTS_NS }));
  }

  return {
    softDeps: { events: () => probeUpstream(config.eventsUrl, '/health') },
    mount(app) {
      if (iss === 'mobile-bff') mountPublic(app);
      mountOperator(app);
    },
    _lastGood: lastGood,
  };
}
