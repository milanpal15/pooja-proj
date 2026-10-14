/**
 * Everything a BFF needs to put the calls service behind its `/api` surface (phase 6), in one call, so the mobile and admin BFFs cannot drift:
 *
 *   - the devotee / astrologer routes (mobile BFF only; needs its identity edge): request / poll / cancel / end / accept / decline / rate a call and the
 *     astrologer's own `/astrologer/me/*` (profile, presence, heartbeat, incoming, calls, earnings). The uid is the signed `sub`; the profile name the
 *     edge already knew rides as `ctx.name`. Calls' status code and body are relayed UNCHANGED (201 created, 402 insufficient_coins + shortfall, 409
 *     astrologer_unavailable / already_in_call / astrologer_busy, 503 wallet_unavailable / settings_unavailable / calls_unavailable / calls_disabled ...).
 *     Whether the caller IS an astrologer is decided inside calls from its own table, never from anything this BFF forwards.
 *     A mutating request is never retried here (the shared client retries idempotent GETs only), so one that may have reached calls is not sent twice -
 *     the app's own retry carries the same requestId, and every minute's debit carries its own key.
 *   - `GET /api/astrologers` and `/api/astrologers/:id` (BOTH BFFs, public): no stale copy is served when calls is down - presence is soft state and an old
 *     "online" would send a devotee into a request that is bound to fail.
 *   - the operator routes (admin BFF): astrologers (list / create / edit / delete / suspend / reactivate), the call log (+ force end, goodwill refund) and
 *     payouts (summary / list / record) behind the area gate, audited.
 *
 * Calls unreachable: `503 {error:'calls_unavailable', code:'calls_unavailable'}` - the code the app already maps to "calls are unavailable". Calls' own
 * answers pass through unchanged, including its 503s about ITS dependencies.
 *
 * Returns `null` when CALLS_URL is unset: the BFF is then exactly as before (the monolith serves all of it).
 */
import express from 'express';

import { createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { probeUpstream } from './proxy.js';
import { CALLS_ADMIN_ROUTES, CALLS_DEVOTEE_ROUTES, CALLS_PUBLIC_GETS } from './calls-routes.js';

export const CALLS_NS = '/internal/calls';
const UNAVAILABLE = { error: 'calls_unavailable', code: 'calls_unavailable' };
/** What the shared client throws when it never got an answer from the service. */
const UNREACHABLE = new Set(['upstream_unavailable', 'upstream_timeout', 'circuit_open', 'service_unavailable', 'internal']);

const stringQuery = (q) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => typeof v === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/** True when calls ANSWERED (a business answer worth relaying) as opposed to not being reachable / broken. */
const answered = (e) => e instanceof ServiceError && e.status !== 401 && (e.status < 500 || (e.body?.code && !UNREACHABLE.has(e.body.code)));

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {{callsUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, callsTimeoutMs?:number, monolithUrl:string}} config
 * @param {object} [o]
 * @param {false|{sessions:object, audit:Function}} [o.operator]  `false` = serves no operator routes; `{sessions, audit}` = identity-backed;
 *        omitted = legacy (the monolith owns session + audit)
 * @param {{requireDevotee:Function, asDevotee:Function}|null} [o.devotee]  the mobile BFF's identity edge (the devotee routes need a verified uid)
 */
export function createCallsMount(iss, config, { logger, fetchImpl, operator, devotee = null } = {}) {
  if (!config.callsUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const secret = config.internalJwtSecret;
  // `codedErrorsAreAnswers`: a wallet or settings outage makes calls answer `503 wallet_unavailable` / `settings_unavailable` to a request. That is calls
  // ANSWERING (about its dependency), not a sick calls: it must not be retried, and it must not open the breaker and shut the polling reads too.
  const client = createServiceClient({
    service: 'calls', baseUrl: config.callsUrl, iss, secret, timeoutMs: config.serviceTimeoutMs, codedErrorsAreAnswers: true, ...extra,
  });
  // Placing / answering a call makes calls ask the wallet (5 s) and the settings (5 s): give it room to finish rather than cut it off and leave the app guessing.
  const moneyTimeoutMs = config.callsTimeoutMs ?? 15_000;

  const legacy = operator === undefined;
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({ iss, monolithUrl: config.monolithUrl, logger, signToken: (claims) => signServiceToken(claims, { secret }), ...extra })
    : operator?.audit;

  /** Relay calls' answer, or say it is unavailable. Our own rejected service token is OUR misconfiguration: 502, never a 401 (it would sign the user out). */
  function relayError(res, e, what) {
    if (answered(e)) return res.status(e.status).json(e.body);
    if (e instanceof ServiceError && e.status === 401) {
      logger?.error(`calls rejected this BFF's service token (${what}): INTERNAL_JWT_SECRET mismatch?`);
      return res.status(502).json({ error: 'upstream_unavailable', code: 'calls_auth_failed' });
    }
    logger?.warn(`calls ${what} unavailable: ${e?.code || e?.message}`);
    return res.status(503).json(UNAVAILABLE);
  }

  function mountPublic(app) {
    const router = express.Router();

    for (const { path } of CALLS_PUBLIC_GETS) {
      router.get(`/api${path}`, async (req, res) => {
        try {
          const to = path.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
          res.json(await client.get(`${CALLS_NS}${to}`, { reqId: req.id, query: stringQuery(req.query) }));
        } catch (e) { relayError(res, e, path); }
      });
    }

    const json = express.json({ limit: '100kb' });

    if (devotee) {
      const as = (req) => devotee.asDevotee(req.deviceAuth);

      for (const r of CALLS_DEVOTEE_ROUTES) {
        const method = r.method.toLowerCase();
        router[method](`/api${r.path}`, devotee.requireDevotee, ...(method === 'get' ? [] : [json]), async (req, res) => {
          try {
            const to = r.path.replace(/:(\w+)/g, (_m, k) => encodeURIComponent(req.params[k]));
            const opts = { reqId: req.id, as: as(req), ...(r.money ? { timeoutMs: moneyTimeoutMs } : {}), full: true };
            const out = method === 'get'
              ? await client.request('GET', `${CALLS_NS}${to}`, { ...opts, query: stringQuery(req.query) })
              : await client.request(r.method, `${CALLS_NS}${to}`, { ...opts, body: req.body ?? {} });
            res.status(out.status).json(out.data);
          } catch (e) { relayError(res, e, r.path); }
        });
      }
    }
    app.use(router);
  }

  function mountOperator(app) {
    if (operator === false) return;
    app.use(engagementAdminRouter({ sessions, client, audit, routes: CALLS_ADMIN_ROUTES, namespace: CALLS_NS }));
  }

  return {
    softDeps: { calls: () => probeUpstream(config.callsUrl, '/health') },
    mount(app) {
      mountPublic(app);
      mountOperator(app);
    },
  };
}
