/**
 * Everything a BFF needs to put the orders service behind its `/api` surface (phase 5), in one call, so the mobile and admin BFFs cannot drift:
 *
 *   - the devotee routes (mobile BFF only; needs its identity edge): bookings (list / get / create / cancel / review) and chadhava orders
 *     (list / create / cancel). The uid is the signed `sub`; the profile name the edge already knew rides as `ctx.name`. Orders' status code and body
 *     are relayed UNCHANGED (201 created / 200 retry, 402 insufficient_coins + shortfall, 409 cannot_cancel, 503 wallet_unavailable /
 *     catalog_unavailable ...). A purchase is never retried here (the shared client retries idempotent GETs only), so a request that may have
 *     reached orders is not sent twice - the app's own retry carries the same requestId and is safe.
 *   - `POST /api/chadhava` (BOTH BFFs, no session): the retired free-amount chadhava's 410, answered by orders.
 *   - `GET /api/poojas/:slug/reviews` (BOTH BFFs, public): stale-while-error for up to an hour (`x-degraded: orders`).
 *   - the operator routes (admin BFF): bookings / reviews / chadhava orders lists and status changes behind the area gate, audited.
 *
 * Orders unreachable: `503 {error:'orders_unavailable', code:'orders_unavailable'}` - a purchase is never reported as made. Orders' own answers pass
 * through unchanged, including its 503 wallet_unavailable / catalog_unavailable.
 *
 * Returns `null` when ORDERS_URL is unset: the BFF is then exactly as before (the monolith serves all of it).
 */
import express from 'express';

import { createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { probeUpstream } from './proxy.js';
import { ORDERS_ADMIN_ROUTES, ORDERS_DEVOTEE_ROUTES, ORDERS_GONE, ORDERS_PUBLIC_GETS } from './orders-routes.js';

export const ORDERS_NS = '/internal/orders';
export const REVIEWS_STALE_MS = 60 * 60_000;
const UNAVAILABLE = { error: 'orders_unavailable', code: 'orders_unavailable' };
/** What the shared client throws when it never got an answer from the service. */
const UNREACHABLE = new Set(['upstream_unavailable', 'upstream_timeout', 'circuit_open', 'service_unavailable', 'internal']);

const stringQuery = (q) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => typeof v === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** True when orders ANSWERED (a business answer worth relaying) as opposed to not being reachable / broken. */
const answered = (e) => e instanceof ServiceError && e.status !== 401 && (e.status < 500 || (e.body?.code && !UNREACHABLE.has(e.body.code)));

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {{ordersUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, ordersTimeoutMs?:number, monolithUrl:string}} config
 * @param {object} [o]
 * @param {false|{sessions:object, audit:Function}} [o.operator]  `false` = serves no operator routes; `{sessions, audit}` = identity-backed;
 *        omitted = legacy (the monolith owns session + audit)
 * @param {{requireDevotee:Function, asDevotee:Function}|null} [o.devotee]  the mobile BFF's identity edge (the devotee routes need a verified uid)
 */
export function createOrdersMount(iss, config, { logger, fetchImpl, operator, devotee = null, now = () => Date.now() } = {}) {
  if (!config.ordersUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const secret = config.internalJwtSecret;
  // `codedErrorsAreAnswers`: a wallet or catalog outage makes orders answer `503 wallet_unavailable` / `catalog_unavailable` to every PURCHASE. That is
  // orders ANSWERING (about its dependency), not a sick orders: it must not be retried, and it must not open the breaker and shut the reads
  // (the bookings list) too.
  const client = createServiceClient({
    service: 'orders', baseUrl: config.ordersUrl, iss, secret, timeoutMs: config.serviceTimeoutMs, codedErrorsAreAnswers: true, ...extra,
  });
  // A purchase makes orders call catalog and wallet (5 s each): give it room to finish rather than cut it off and leave the app guessing.
  const purchaseTimeoutMs = config.ordersTimeoutMs ?? 15_000;

  const legacy = operator === undefined;
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({ iss, monolithUrl: config.monolithUrl, logger, signToken: (claims) => signServiceToken(claims, { secret }), ...extra })
    : operator?.audit;

  const lastGood = new Map();

  /** Relay orders' answer, or say it is unavailable. Our own rejected service token is OUR misconfiguration: 502, never a 401 (it would sign the user out). */
  function relayError(res, e, what) {
    if (answered(e)) return res.status(e.status).json(e.body);
    if (e instanceof ServiceError && e.status === 401) {
      logger?.error(`orders rejected this BFF's service token (${what}): INTERNAL_JWT_SECRET mismatch?`);
      return res.status(502).json({ error: 'upstream_unavailable', code: 'orders_auth_failed' });
    }
    logger?.warn(`orders ${what} unavailable: ${e?.code || e?.message}`);
    return res.status(503).json(UNAVAILABLE);
  }

  function mountPublic(app) {
    const router = express.Router();

    for (const { path, maxStaleMs } of ORDERS_PUBLIC_GETS) {
      router.get(`/api${path}`, async (req, res) => {
        const key = req.originalUrl;
        try {
          const body = await client.get(`${ORDERS_NS}${req.path.replace(/^\/api/, '')}`, { reqId: req.id, query: stringQuery(req.query) });
          if (lastGood.size >= 300) lastGood.delete(lastGood.keys().next().value);
          lastGood.set(key, { at: now(), body });
          res.json(body);
        } catch (e) {
          if (answered(e)) return res.status(e.status).json(e.body);
          const hit = lastGood.get(key);
          if (hit && now() - hit.at < maxStaleMs && !(e instanceof ServiceError && e.status === 401)) {
            logger?.warn(`orders ${path} degraded: ${e?.code || e?.message}`);
            res.setHeader('x-degraded', 'orders');
            return res.json(hit.body);
          }
          relayError(res, e, path);
        }
      });
    }

    const json = express.json({ limit: '100kb' });

    // The retired free-amount chadhava: no devotee needed, orders answers the 410 (both BFFs, as the monolith answered it to anyone).
    router.post(`/api${ORDERS_GONE.path}`, json, async (req, res) => {
      try {
        const { status, data } = await client.request('POST', `${ORDERS_NS}${ORDERS_GONE.path}`, { reqId: req.id, body: req.body ?? {}, full: true });
        res.status(status).json(data);
      } catch (e) { relayError(res, e, 'chadhava'); }
    });

    if (devotee) {
      const as = (req) => devotee.asDevotee(req.deviceAuth);

      for (const r of ORDERS_DEVOTEE_ROUTES) {
        const method = r.method.toLowerCase();
        router[method](`/api${r.path}`, devotee.requireDevotee, ...(method === 'get' ? [] : [json]), async (req, res) => {
          try {
            const to = r.path.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
            const opts = { reqId: req.id, as: as(req), ...(r.purchase ? { timeoutMs: purchaseTimeoutMs } : {}), full: true };
            const out = method === 'get'
              ? await client.request('GET', `${ORDERS_NS}${to}`, { ...opts, query: stringQuery(req.query) })
              : await client.request(r.method, `${ORDERS_NS}${to}`, { ...opts, body: req.body ?? {} });
            res.status(out.status).json(out.data);
          } catch (e) { relayError(res, e, r.path); }
        });
      }
    }
    app.use(router);
  }

  function mountOperator(app) {
    if (operator === false) return;
    app.use(engagementAdminRouter({ sessions, client, audit, routes: ORDERS_ADMIN_ROUTES, namespace: ORDERS_NS }));
  }

  return {
    softDeps: { orders: () => probeUpstream(config.ordersUrl, '/health') },
    mount(app) {
      mountPublic(app);
      mountOperator(app);
    },
    _lastGood: lastGood,
  };
}
