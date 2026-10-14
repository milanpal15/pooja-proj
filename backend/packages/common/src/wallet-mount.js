/**
 * Everything a BFF needs to put the wallet service behind its `/api` surface (phase 4), in one call, so the mobile and admin BFFs
 * cannot drift:
 *
 *   - `GET /api/coins/packs`          public; the last good list is served (flagged `x-degraded: wallet`) for up to an hour if wallet is down.
 *   - `POST /api/webhooks/razorpay`   BOTH BFFs: STREAMED to wallet byte for byte with every header (`x-razorpay-signature`, content-type,
 *                                     length) as received - the signature is an HMAC over the RAW bytes, so nothing here parses, trims or
 *                                     re-serialises the body. Wallet verifies it. Wallet down = 503 `wallet_unavailable` (Razorpay then retries).
 *                                     The webhook URL Razorpay is given must keep pointing at a BFF, never at the wallet service.
 *   - the devotee routes (mobile BFF only; needs its identity edge): `GET /api/wallet`, `GET /api/wallet/transactions`,
 *                                     `POST /api/wallet/orders`, `POST /api/wallet/orders/:orderId/verify`. The uid is the signed `sub`.
 *   - the operator routes (admin BFF): wallet search / ledger / adjust, coin packs, coin orders and stats, billing rules - behind the
 *                                     area gate, audited.
 *
 * MONEY FAILS CLOSED: a wallet that cannot be reached is 503 `{error:'wallet_unavailable', code:'wallet_unavailable'}` - never an empty
 * balance, never success. Wallet's own answers (402, 400, 404, 503 payments_unavailable, 502 payments_failed ...) pass through UNCHANGED.
 * A write is never retried here (the shared client retries idempotent GETs only), so a request that may have reached wallet is not sent twice.
 *
 * Returns `null` when WALLET_URL is unset: the BFF is then exactly as before (the monolith serves all of it).
 */
import express from 'express';

import { CircuitBreaker, createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { createProxy, probeUpstream } from './proxy.js';
import { RAZORPAY_WEBHOOK, WALLET_ADMIN_ROUTES, WALLET_PUBLIC_GETS } from './wallet-routes.js';

export const WALLET_NS = '/internal/wallet';
export const PACKS_STALE_MS = 60 * 60_000;
const UNAVAILABLE = { error: 'wallet_unavailable', code: 'wallet_unavailable' };
/** What the shared client throws when it never got an answer from the service. */
const UNREACHABLE = new Set(['upstream_unavailable', 'upstream_timeout', 'circuit_open', 'service_unavailable', 'internal']);

const stringQuery = (q) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => typeof v === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** True when wallet ANSWERED (a business answer worth relaying) as opposed to not being reachable / broken. */
const answered = (e) => e instanceof ServiceError && e.status !== 401 && (e.status < 500 || (e.body?.code && !UNREACHABLE.has(e.body.code)));

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {{walletUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, proxyTimeoutMs?:number, monolithUrl:string}} config
 * @param {object} [o]
 * @param {false|{sessions:object, audit:Function}} [o.operator]  `false` = serves no operator routes; `{sessions, audit}` = identity-backed;
 *        omitted = legacy (the monolith owns session + audit)
 * @param {{requireDevotee:Function, asDevotee:Function}|null} [o.devotee]  the mobile BFF's identity edge (the devotee routes need a verified uid)
 */
export function createWalletMount(iss, config, { logger, fetchImpl, operator, devotee = null, now = () => Date.now() } = {}) {
  if (!config.walletUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const secret = config.internalJwtSecret;
  // A higher breaker threshold than the default: a run of Razorpay failures (wallet answers 502 payments_failed) must not shut the balance reads.
  const client = createServiceClient({
    service: 'wallet', baseUrl: config.walletUrl, iss, secret, timeoutMs: config.serviceTimeoutMs, breaker: new CircuitBreaker({ threshold: 10 }), ...extra,
  });

  const legacy = operator === undefined;
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({ iss, monolithUrl: config.monolithUrl, logger, signToken: (claims) => signServiceToken(claims, { secret }), ...extra })
    : operator?.audit;

  const lastGood = new Map();

  /** Relay wallet's answer, or say it is unavailable. Our own rejected service token is OUR misconfiguration: 502, never a 401 (it would sign the user out). */
  function relayError(res, e, what) {
    if (answered(e)) return res.status(e.status).json(e.body);
    if (e instanceof ServiceError && e.status === 401) {
      logger?.error(`wallet rejected this BFF's service token (${what}): INTERNAL_JWT_SECRET mismatch?`);
      return res.status(502).json({ error: 'upstream_unavailable', code: 'wallet_auth_failed' });
    }
    logger?.warn(`wallet ${what} unavailable: ${e?.code || e?.message}`);
    return res.status(503).json(UNAVAILABLE);
  }

  function mountPublic(app) {
    const router = express.Router();

    for (const { path, maxStaleMs } of WALLET_PUBLIC_GETS) {
      router.get(`/api${path}`, async (req, res) => {
        const key = req.originalUrl;
        try {
          const body = await client.get(`${WALLET_NS}${path}`, { reqId: req.id, query: stringQuery(req.query) });
          if (lastGood.size >= 50) lastGood.delete(lastGood.keys().next().value);
          lastGood.set(key, { at: now(), body });
          res.json(body);
        } catch (e) {
          if (answered(e)) return res.status(e.status).json(e.body);
          const hit = lastGood.get(key);
          if (hit && now() - hit.at < maxStaleMs && !(e instanceof ServiceError && e.status === 401)) {
            logger?.warn(`wallet ${path} degraded: ${e?.code || e?.message}`);
            res.setHeader('x-degraded', 'wallet');
            return res.json(hit.body);
          }
          relayError(res, e, path);
        }
      });
    }

    /* The Razorpay webhook: bytes in, the same bytes out. NO body parser may be mounted in front of this. */
    const webhook = createProxy({
      target: config.walletUrl,
      timeoutMs: config.proxyTimeoutMs,
      logger,
      pathFor: () => `${WALLET_NS}/webhooks/razorpay`,
      unavailable: { status: 503, error: 'wallet_unavailable' },
      transformHeaders: (req, headers) => {
        delete headers.cookie;
        headers.authorization = `Bearer ${signServiceToken({ iss, reqId: req.id }, { secret })}`;
      },
    });
    router.post(RAZORPAY_WEBHOOK, webhook);

    if (devotee) {
      const json = express.json({ limit: '16kb' });
      const as = (req) => devotee.asDevotee(req.deviceAuth);
      router.get('/api/wallet', devotee.requireDevotee, async (req, res) => {
        try {
          res.json(await client.get(`${WALLET_NS}/wallet`, { reqId: req.id, as: as(req) }));
        } catch (e) { relayError(res, e, 'balance'); }
      });
      router.get('/api/wallet/transactions', devotee.requireDevotee, async (req, res) => {
        try {
          res.json(await client.get(`${WALLET_NS}/wallet/transactions`, { reqId: req.id, as: as(req), query: stringQuery(req.query) }));
        } catch (e) { relayError(res, e, 'transactions'); }
      });
      router.post('/api/wallet/orders', devotee.requireDevotee, json, async (req, res) => {
        try {
          res.json(await client.post(`${WALLET_NS}/wallet/orders`, req.body ?? {}, { reqId: req.id, as: as(req) }));
        } catch (e) { relayError(res, e, 'order'); }
      });
      router.post('/api/wallet/orders/:orderId/verify', devotee.requireDevotee, json, async (req, res) => {
        try {
          res.json(await client.post(`${WALLET_NS}/wallet/orders/${encodeURIComponent(req.params.orderId)}/verify`, req.body ?? {}, { reqId: req.id, as: as(req) }));
        } catch (e) { relayError(res, e, 'verify'); }
      });
    }
    app.use(router);
  }

  function mountOperator(app) {
    if (operator === false) return;
    app.use(engagementAdminRouter({ sessions, client, audit, routes: WALLET_ADMIN_ROUTES, namespace: WALLET_NS }));
  }

  return {
    softDeps: { wallet: () => probeUpstream(config.walletUrl, '/health') },
    mount(app) {
      mountPublic(app);
      mountOperator(app);
    },
  };
}
