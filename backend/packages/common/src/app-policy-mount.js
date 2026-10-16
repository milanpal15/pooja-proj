/**
 * The mobile BFF's side of app releases / version gating (docs/RELEASES.md sections 3-4):
 *
 *   GET /api/app/policy   public; the phone asks "what should this build do?" at launch / resume. engagement upserts the device row and decides.
 *                         NEVER a 5xx: any internal failure answers 200 { status:'ok', degraded:true } (or the last cached decision).
 *   the version GATE      a middleware in front of every other route. It compares the caller's `X-App-Version-Code` with the in-memory policy
 *                         and answers 426 { code:'app_outdated' } / 503 { code:'maintenance' } for a blocking status, counting each in memory.
 *
 * FAIL OPEN, everywhere: no policy loaded, an unreachable engagement, a malformed answer, a thrown error => the request passes.
 * The policy is refreshed at most every REFRESH_MS (in the background once something is cached, so no request waits on it), kept up to
 * STALE_MS when refreshing fails, and dropped (=> pass) after that. Blocked-request counters are flushed to engagement every FLUSH_MS.
 *
 * Exempt from the gate: the policy route itself, health, uploads, webhooks (a payment provider is not a phone) and CORS preflights.
 */
import express from 'express';

import { evaluatePolicy, intOrNull, isBlocking, policyResponse } from './app-policy.js';
import { createServiceClient } from './client.js';

export const POLICY_REFRESH_MS = 30_000;
export const POLICY_STALE_MS = 60 * 60_000;
export const POLICY_RETRY_MS = 5_000;
export const BLOCKED_FLUSH_MS = 60_000;
const NS = '/internal/engagement';

const EXEMPT = [/^\/api\/app\/policy\/?$/, /^\/api\/health\/?$/, /^\/health(\/|$)/, /^\/uploads(\/|$)/, /^\/api\/webhooks(\/|$)/];
export const isGateExempt = (method, path) => method === 'OPTIONS' || EXEMPT.some((r) => r.test(path));

const header = (req, name) => {
  const v = req.headers?.[name];
  return Array.isArray(v) ? v[0] : v;
};
/** Bounded plain string from a header / query value. */
const short = (v, max = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * @param {{ engagementUrl?: string, internalJwtSecret?: string, serviceTimeoutMs?: number }} config
 * @param {object} [o]
 * @param {object} [o.logger]
 * @param {typeof fetch} [o.fetchImpl]
 * @param {() => number} [o.now]            clock (tests pass a fake)
 * @param {(req) => Promise<string|null>} [o.resolveUid]  the signed-in devotee's uid when the request already carries a verified token (identity edge); optional
 * @param {number} [o.flushEveryMs]
 */
export function createAppPolicyMount(config, { logger, fetchImpl, now = () => Date.now(), resolveUid, flushEveryMs = BLOCKED_FLUSH_MS } = {}) {
  const enabled = !!config.engagementUrl;
  const client = enabled
    ? createServiceClient({
        service: 'engagement', baseUrl: config.engagementUrl, iss: 'mobile-bff', secret: config.internalJwtSecret, timeoutMs: config.serviceTimeoutMs,
        ...(fetchImpl ? { fetchImpl } : {}),
      })
    : null;

  /* ---------------------------------------------------------------- policy cache -- */
  let cached = null; // { policy, names: Map }
  let goodAt = 0; // when `cached` was fetched successfully
  let nextTryAt = 0;
  let inflight = null;

  function refresh(reqId) {
    if (!client) return Promise.resolve(false);
    if (inflight) return inflight;
    inflight = client
      .get(`${NS}/policy`, { reqId, timeoutMs: 1500 })
      .then((body) => {
        if (!body || typeof body.policy !== 'object' || body.policy === null) throw new Error('malformed policy answer');
        const names = new Map((Array.isArray(body.releases) ? body.releases : []).filter((r) => Number.isInteger(r?.versionCode) && r.versionName).map((r) => [r.versionCode, r.versionName]));
        cached = { policy: body.policy, names };
        goodAt = now();
        nextTryAt = goodAt + POLICY_REFRESH_MS;
        return true;
      })
      .catch((e) => {
        nextTryAt = now() + (cached ? POLICY_REFRESH_MS : POLICY_RETRY_MS);
        logger?.warn(`version policy refresh failed (${e?.code || e?.message}): ${cached ? 'keeping the last good policy' : 'failing open'}`);
        return false;
      })
      .finally(() => { inflight = null; });
    return inflight;
  }

  /** The policy to judge by, or null (=> pass). Never throws, never waits on the network once something is cached. */
  async function currentPolicy(reqId) {
    if (!client) return null;
    if (cached && now() - goodAt >= POLICY_STALE_MS) cached = null; // too old to trust
    if (!cached) {
      if (now() >= nextTryAt) await refresh(reqId); // first load (or recovery): one short wait, then fail open
      return cached;
    }
    if (now() >= nextTryAt) refresh(reqId); // stale-while-revalidate: this request is not delayed
    return cached;
  }

  /* ------------------------------------------------------------- blocked counters -- */
  const counts = new Map(); // `${platform}|${versionCode}` -> n
  let flushTimer = null;
  const MAX_KEYS = 500;

  async function flush() {
    if (!client || counts.size === 0) return;
    const batch = [...counts.entries()].map(([k, count]) => {
      const [platform, vc] = k.split('|');
      return { platform, versionCode: vc === '' ? null : Number(vc), count };
    });
    counts.clear();
    try {
      await client.post(`${NS}/policy/blocked-counts`, { counts: batch }, { timeoutMs: 3000 });
    } catch (e) {
      logger?.warn(`blocked-count flush failed (${e?.code || e?.message}): keeping the counts for the next flush`);
      for (const b of batch) {
        const k = `${b.platform}|${b.versionCode ?? ''}`;
        if (counts.size < MAX_KEYS || counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + b.count);
      }
    }
    if (counts.size && flushEveryMs) schedule();
  }
  function schedule() {
    if (flushTimer || !flushEveryMs) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush(); }, flushEveryMs);
    flushTimer.unref?.();
  }
  function count(platform, versionCode) {
    const k = `${platform}|${versionCode ?? ''}`;
    if (counts.size >= MAX_KEYS && !counts.has(k)) return;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    schedule();
  }

  /* ------------------------------------------------------------------ the gate -- */
  async function uidOf(req) {
    if (!resolveUid) return null;
    try {
      return (await resolveUid(req)) || null;
    } catch {
      return null;
    }
  }

  /** `{ platform, versionCode, osApi }` as the phone reports it. */
  const callerOf = (req) => ({
    platform: (short(header(req, 'x-app-platform'), 16) || 'android').toLowerCase(),
    versionCode: header(req, 'x-app-version-code'),
    osApi: header(req, 'x-os-api'),
  });

  async function gate(req, res, next) {
    try {
      if (!client || isGateExempt(req.method, req.path)) return next();
      const c = callerOf(req);
      if (c.platform !== 'android') return next(); // only android exists today; an unknown platform has no policy
      const hit = await currentPolicy(req.id);
      if (!hit) return next();
      const needsUid = hit.policy?.maintenance?.enabled === true && Array.isArray(hit.policy.maintenance.allowUids) && hit.policy.maintenance.allowUids.length > 0;
      let decision = evaluatePolicy(hit.policy, { ...c, uid: null, now: now(), names: hit.names });
      if (decision.status === 'maintenance' && needsUid && /^Bearer\s+\S/i.test(req.headers.authorization || '')) {
        const uid = await uidOf(req);
        if (uid) decision = evaluatePolicy(hit.policy, { ...c, uid, now: now(), names: hit.names });
      }
      if (!isBlocking(decision.status)) return next();

      if (decision.status !== 'maintenance') count(c.platform, intOrNull(c.versionCode));
      if (decision.status === 'maintenance') {
        const secs = decision.maintenanceUntil ? Math.max(1, Math.ceil((Date.parse(decision.maintenanceUntil) - now()) / 1000)) : 60;
        res.setHeader('retry-after', String(Math.min(secs, 3600)));
        return res.status(503).json({
          error: decision.message || 'The app is under maintenance. Please try again shortly.',
          code: 'maintenance', status: 'maintenance', message: decision.message, messageHi: decision.messageHi, maintenanceUntil: decision.maintenanceUntil,
        });
      }
      return res.status(426).json({
        error: decision.message || 'Please update the app to continue.',
        code: 'app_outdated', status: decision.status, message: decision.message, messageHi: decision.messageHi, storeUrl: decision.storeUrl, minVersionName: decision.minVersionName,
      });
    } catch (e) {
      logger?.error(`version gate error (failing open): ${e?.stack || e}`);
      next();
    }
  }

  /* ------------------------------------------------------------ GET /api/app/policy -- */
  const OK = { status: 'ok', degraded: true };

  async function policyRoute(req, res) {
    const q = (k, h) => (typeof req.query?.[k] === 'string' ? req.query[k] : header(req, h));
    const c = {
      platform: (short(q('platform', 'x-app-platform'), 16) || 'android').toLowerCase(),
      versionCode: q('versionCode', 'x-app-version-code'),
      osApi: q('osApi', 'x-os-api'),
    };
    res.setHeader('cache-control', 'no-store');
    try {
      if (!client) throw new Error('engagement is not configured');
      const uid = await uidOf(req);
      const out = await client.post(
        `${NS}/policy/evaluate`,
        {
          platform: c.platform, versionCode: c.versionCode, osApi: c.osApi, uid,
          deviceId: short(header(req, 'x-device-id'), 120), versionName: short(header(req, 'x-app-version')), model: short(q('model', 'x-device-model'), 80),
        },
        { reqId: req.id, timeoutMs: 2500 },
      );
      if (!out || typeof out.status !== 'string') throw new Error('malformed evaluate answer');
      return res.json(policyResponse(out, now()));
    } catch (e) {
      logger?.warn(`app policy degraded: ${e?.code || e?.message}`);
      res.setHeader('x-degraded', 'engagement');
      // The last cached policy still knows if this build is blocked; with nothing cached the answer is simply "ok".
      let body = { ...OK };
      if (cached && now() - goodAt < POLICY_STALE_MS) {
        try {
          body = { ...evaluatePolicy(cached.policy, { ...c, uid: null, now: now(), names: cached.names }), degraded: true };
        } catch { /* keep ok */ }
      }
      return res.json(policyResponse(body, now()));
    }
  }

  return {
    softDeps: {}, // engagement's own mount already reports it
    /** Mount FIRST: the gate guards every route registered after it. */
    mount(app) {
      app.use(gate);
      const r = express.Router();
      r.get('/api/app/policy', policyRoute);
      app.use(r);
    },
    gate,
    refresh,
    flush,
    /** Test / ops introspection. */
    _state: () => ({ cached: !!cached, goodAt, counts: Object.fromEntries(counts), inflight: !!inflight }),
    _settle: async () => { while (inflight) await inflight; },
  };
}
