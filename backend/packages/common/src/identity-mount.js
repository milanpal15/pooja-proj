/**
 * Phase 2 (identity): who authenticates now.
 *
 *   mobile-bff   verifies the Firebase ID token, asks identity whether the devotee is blocked (EVERY authenticated
 *                request, short cache, FAIL CLOSED with 503), serves /api/auth/* and the policy routes from identity, and
 *                forwards everything else to the monolith with a signed service token (iss mobile-bff, sub uid, ctx name/role).
 *   admin-bff    owns the operator session cookie and the login throttle, checks the operator against identity on every
 *                request, applies the area gate, serves the operator routes identity owns, audits every operator write,
 *                and forwards everything else to the monolith with a signed service token (iss admin-bff, sub operatorId, perms).
 *
 * The monolith trusts those tokens only (pooja-api/src/lib/trusted-claims.js): devotee routes from mobile-bff, operator
 * routes from admin-bff. A BFF never forwards the end user's Firebase token or cookie.
 *
 * Both return `null` when IDENTITY_URL is unset: the BFFs are then exactly the phase-1 gateways.
 */
import express from 'express';

import { createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { signServiceToken } from './jwt.js';
import { permissionsFor } from './operator/access/permissions.js';
import { createIdentityAuditor } from './operator/audit.js';
import { identityAdminRouter } from './operator/identity-routes.js';
import { createOperatorSessions } from './operator/identity-session.js';
import { createLimiter } from './operator/login-limiter.js';
import { isPublic } from './operator/public-routes.js';
import { createSessionCookies } from './operator/session-cookie.js';
import { probeUpstream } from './proxy.js';

export const STATUS_TTL_MS = 10_000;
const MAX_PASSWORD_LENGTH = 256;
const NS = '/internal/identity';

const clientFor = (iss, config, fetchImpl) =>
  createServiceClient({
    service: 'identity',
    baseUrl: config.identityUrl,
    iss,
    secret: config.internalJwtSecret,
    timeoutMs: config.serviceTimeoutMs,
    ...(fetchImpl ? { fetchImpl } : {}),
  });

const UNAVAILABLE = { error: 'identity_unavailable', code: 'identity_unavailable' };

/** Pass an identity answer through; identity being down is a clear 503, our own bad service token is a 502 (never a sign-out). */
function relayError(res, e, logger) {
  if (e instanceof ServiceError) {
    if (e.status === 401 && e.body?.code !== 'bad_credentials') return res.status(502).json({ error: 'upstream_unavailable', code: 'identity_auth_failed' });
    if (e.status >= 500) {
      logger?.warn(`identity answered ${e.status}: ${e.code || e.message}`);
      return res.status(503).json(UNAVAILABLE);
    }
    return res.status(e.status).json(e.body);
  }
  logger?.error(`identity route failed: ${e?.stack || e}`);
  return res.status(500).json({ error: 'Something went wrong.', code: 'internal' });
}

/* ──────────────────────────────────────────────────────────── mobile-bff ── */

/** Read `aud` out of an UNVERIFIED token - only to make a project mismatch legible in the log, never to decide trust. */
function decodeAudience(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).aud ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {{identityUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number}} config
 * @param {object} o
 * @param {(token:string) => Promise<object>} o.verifyIdToken  firebase-admin's verifyIdToken (injected; tests pass a fake)
 * @param {{ready:()=>boolean, error:()=>string|null, projectId:()=>string|null}} o.firebase
 */
export function createIdentityMobileMount(config, { logger, fetchImpl, verifyIdToken, firebase, now = () => Date.now() } = {}) {
  if (!config.identityUrl) return null;
  const secret = config.internalJwtSecret;
  const client = clientFor('mobile-bff', config, fetchImpl);

  /* The per-request blocked check: cached STATUS_TTL_MS per uid, concurrent asks share one call, and an outage is NOT
     papered over with a stale answer - that is the fail-closed part (a blocked devotee must not get through because
     identity blinked). */
  const statuses = new Map(); // uid -> { at, value }
  const inflight = new Map();
  async function statusOf(uid, reqId) {
    const hit = statuses.get(uid);
    if (hit && now() - hit.at < STATUS_TTL_MS) return hit.value;
    if (!inflight.has(uid)) {
      inflight.set(
        uid,
        client
          .get(`${NS}/users/${encodeURIComponent(uid)}/status`, { reqId, timeoutMs: 2500 })
          .then((v) => {
            if (statuses.size > 5000) statuses.clear();
            statuses.set(uid, { at: now(), value: v });
            return v;
          })
          .finally(() => inflight.delete(uid)),
      );
    }
    return inflight.get(uid);
  }

  /**
   * Sets `req.deviceAuth` for any request that presents a Bearer token; never answers (public routes ignore a bad token,
   * exactly as the monolith's requireAuth is only run by the routes that want it):
   *   { ok:true, uid, name, role, tok }   verified, not blocked
   *   { error:'invalid'|'blocked'|'unavailable', detail }
   */
  async function deviceAuth(req, _res, next) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const token = m ? m[1].trim() : '';
    if (!token) return next();
    if (!firebase.ready()) {
      req.deviceAuth = { error: 'unavailable', detail: `Firebase Admin is not configured on the server (${firebase.error()}).` };
      return next();
    }
    let decoded;
    try {
      decoded = await verifyIdToken(token);
    } catch (e) {
      if (/audience|aud.*claim/i.test(e?.message || '')) {
        logger?.error(
          'PROJECT MISMATCH - this token is not for the project this BFF verifies. ' +
            `app mints tokens for: ${decodeAudience(token) ?? '(unreadable)'}  (poojaappclone/google-services.json); ` +
            `BFF verifies for: ${firebase.projectId()}  (FIREBASE_PROJECT_ID / FIREBASE_SERVICE_ACCOUNT_PATH). Both must be the same Firebase project. See docs/FIREBASE_SETUP.md.`,
        );
      }
      req.deviceAuth = { error: 'invalid', detail: e?.message };
      return next();
    }
    try {
      const st = await statusOf(decoded.uid, req.id);
      if (st.blocked) req.deviceAuth = { error: 'blocked' };
      else {
        req.deviceAuth = {
          ok: true,
          uid: decoded.uid,
          name: st.name || '',
          role: st.role === 'astrologer' ? 'astrologer' : 'devotee',
          tok: {
            phone_number: decoded.phone_number, email: decoded.email, email_verified: decoded.email_verified === true,
            picture: decoded.picture, name: decoded.name, provider: decoded.firebase?.sign_in_provider,
          },
        };
      }
    } catch (e) {
      logger?.warn(`blocked-check failed (${e?.code || e?.message}): failing closed`, { reqId: req.id });
      req.deviceAuth = { error: 'unavailable', detail: 'identity is unavailable' };
    }
    next();
  }

  /** requireAuth's exact answers, for the routes this BFF serves itself. */
  const requireDevotee = (req, res, next) => {
    const a = req.deviceAuth;
    if (!a) return res.status(401).json({ error: 'missing bearer token' });
    if (a.error === 'unavailable') return res.status(503).json({ error: 'auth unavailable', detail: a.detail });
    if (a.error === 'invalid') return res.status(401).json({ error: 'invalid token', detail: a.detail });
    if (a.error === 'blocked') return res.status(403).json({ error: 'account blocked' });
    next();
  };

  const asDevotee = (a) => ({ sub: a.uid, role: a.role, ctx: { name: a.name, role: a.role, tok: a.tok } });

  /** The token the monolith trusts. A failed auth is signed too, so the monolith answers requireAuth's 401/403/503 itself. */
  function monolithToken(req) {
    const a = req.deviceAuth;
    if (!a) return null;
    return signServiceToken(
      a.ok
        ? { iss: 'mobile-bff', reqId: req.id, ...asDevotee(a) }
        : { iss: 'mobile-bff', reqId: req.id, sub: null, ctx: { authError: a.error, detail: a.detail } },
      { secret },
    );
  }

  const json = express.json({ limit: '256kb' });

  function mount(app) {
    app.use('/api', deviceAuth);
    const r = express.Router();
    const forward = (method, apiPath, to, { auth = true } = {}) => {
      const chain = [...(auth ? [requireDevotee] : []), json, async (req, res) => {
        try {
          const suffix = to(req);
          const opts = { reqId: req.id, ...(auth ? { as: asDevotee(req.deviceAuth) } : {}) };
          const out = method === 'get' ? await client.get(`${NS}${suffix}`, opts) : await client.request(method.toUpperCase(), `${NS}${suffix}`, { ...opts, body: req.body ?? {} });
          res.json(out);
        } catch (e) {
          relayError(res, e, logger);
        }
      }];
      r[method](apiPath, ...chain);
    };
    forward('post', '/api/auth/sync', () => '/auth/sync');
    forward('get', '/api/auth/me', () => '/auth/me');
    forward('put', '/api/auth/me', () => '/auth/me');
    forward('get', '/api/auth/saved-temples', () => '/auth/saved-temples');
    forward('put', '/api/auth/saved-temples', () => '/auth/saved-temples');
    forward('get', '/api/policy/:key', (req) => `/policy/${encodeURIComponent(req.params.key)}`, { auth: false });
    forward('post', '/api/policy/:key/accept', (req) => `/policy/${encodeURIComponent(req.params.key)}/accept`);
    app.use(r);
  }

  /**
   * The phone's FCM registration token (background push): `POST /api/push/register {token, platform}` -> 201 {ok:true}, `DELETE /api/push/register {token}`
   * -> 200 {ok:true}; a missing / blank / oversized token is identity's 400 {error, code:'bad_token'}, relayed unchanged. The account is the verified uid
   * (signed `sub`), never anything in the body. Explicit paths only - the fail-closed list. The admin BFF does not serve these (see `rejectFcmRegistration`).
   *
   * The path is SHARED with a pre-existing anonymous route: the engagement service's Expo registration `POST /api/push/register {deviceId, pushToken}` (in the
   * monolith's PUBLIC allowlist, served by both BFFs). Mounted BEFORE the engagement routes (see mobile app.js), this one lets that legacy call through
   * untouched (`next('route')`: no Authorization header AND a body naming `deviceId` / `pushToken`); everything else is the FCM contract, which requires the
   * devotee auth edge - so an unauthenticated `{token}` is a 401, never a quiet 400 from the legacy handler.
   */
  function mountPushRegister(app) {
    const r = express.Router();
    const legacyExpo = (req) => !req.headers.authorization && (typeof req.body?.deviceId === 'string' || typeof req.body?.pushToken === 'string');
    const handler = (method) => async (req, res) => {
      try {
        const out = await client.request(method.toUpperCase(), `${NS}/push/register`, { reqId: req.id, as: asDevotee(req.deviceAuth), body: req.body ?? {}, full: true });
        res.status(out.status).json(out.data);
      } catch (e) {
        relayError(res, e, logger);
      }
    };
    r.post('/api/push/register', json, (req, _res, next) => (legacyExpo(req) ? next('route') : next()), deviceAuth, requireDevotee, handler('post'));
    r.delete('/api/push/register', json, deviceAuth, requireDevotee, handler('delete'));
    app.use(r);
  }

  return {
    softDeps: { identity: () => probeUpstream(config.identityUrl, '/health') },
    mount,
    mountPushRegister,
    /** The device auth edge for routes OTHER mounts serve (catalog's Jai): same answers as requireAuth, same signed claims. */
    devotee: { requireDevotee, asDevotee },
    /** For createGatewayApp: swap the end user's credentials for this BFF's signed token. */
    proxyHeaders(req, headers) {
      delete headers.cookie; // an operator cookie means nothing to the monolith (and a phone has none)
      delete headers.authorization; // never forward the Firebase token
      if (req.originalUrl.startsWith('/api')) {
        const t = monolithToken(req);
        if (t) headers.authorization = `Bearer ${t}`;
      }
    },
    _statusCacheSize: () => statuses.size,
  };
}

/* ───────────────────────────────────────────────────────────── admin-bff ── */

/**
 * @param {{identityUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, sessionSecret:string, sessionSameSite?:string, isProduction:boolean}} config
 */
export function createIdentityAdminMount(config, { logger, fetchImpl, now } = {}) {
  if (!config.identityUrl) return null;
  const secret = config.internalJwtSecret;
  const client = clientFor('admin-bff', config, fetchImpl);
  const cookies = createSessionCookies({ secret: config.sessionSecret, sameSite: config.sessionSameSite || 'Strict', isProduction: config.isProduction, ...(now ? { now } : {}) });
  const sessions = createOperatorSessions({ client, cookies, isProduction: config.isProduction, logger, ...(now ? { now } : {}) });
  const identityAudit = createIdentityAuditor({ client, logger });
  /** Records the write and, for an operator change, drops the cached session so a demotion bites immediately here. */
  const audit = (entry) => {
    identityAudit(entry);
    if (/^\/admin\/operators(\/|$)/.test(entry.path) && entry.method !== 'GET') sessions.invalidate();
  };

  // The throttle: 10 failures per client+user and 40 per client, per 15 minutes -> 429. In memory, per instance.
  const WINDOW = 15 * 60 * 1000;
  const perUser = createLimiter({ max: 10, windowMs: WINDOW });
  const perClient = createLimiter({ max: 40, windowMs: WINDOW });

  const json = express.json({ limit: '64kb' });
  const apiPath = (req) => req.path.replace(/^\/api(?=\/)/, '');

  function mountSessionRoutes(router) {
    router.post('/api/admin/login', json, async (req, res) => {
      try {
        const username = String(req.body?.username ?? '').toLowerCase().trim().slice(0, 64);
        const password = String(req.body?.password ?? '');
        const state = await client.get(`${NS}/operators/session`, { query: { id: '' }, reqId: req.id, timeoutMs: 2500 });
        if (state?.required === false) return res.json({ ok: true, required: false });

        const clientKey = `ip:${req.ip}`;
        const userKey = `${req.ip}|${username}`;
        for (const [limiter, key] of [[perClient, clientKey], [perUser, userKey]]) {
          const { blocked, retryAfterSec } = limiter.check(key);
          if (blocked) {
            res.setHeader('Retry-After', String(retryAfterSec));
            return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.', code: 'rate_limited', retryAfterSec });
          }
        }
        const fail = () => {
          perClient.fail(clientKey);
          perUser.fail(userKey);
          return res.status(401).json({ error: 'Wrong username or password' });
        };
        if (password.length > MAX_PASSWORD_LENGTH) return fail(); // refused without hashing it

        let op;
        try {
          op = await client.post(`${NS}/operators/login`, { username, password }, { reqId: req.id });
        } catch (e) {
          if (e instanceof ServiceError && e.status === 401 && e.body?.code === 'bad_credentials') return fail();
          throw e;
        }
        perUser.reset(userKey);
        cookies.set(res, { uid: op.id, role: op.role });
        res.json({ ok: true, required: true, username: op.username, role: op.role, permissions: op.permissions });
      } catch (e) {
        relayError(res, e, logger);
      }
    });

    router.post('/api/admin/logout', (_req, res) => {
      cookies.clear(res);
      res.json({ ok: true });
    });

    /** Lets the dashboard pick between the login screen and the real UI. */
    router.get('/api/admin/session', async (req, res) => {
      const r = await sessions.state(req);
      if (r.error) return res.status(503).json(UNAVAILABLE);
      const st = r.state;
      if (st?.required === false) return res.json({ required: false, authed: true, role: 'admin', permissions: permissionsFor('admin') });
      if (!r.s || !st?.authed) return res.json({ required: true, authed: false });
      res.json({ required: true, authed: true, username: st.username, role: st.role, permissions: st.permissions });
    });
  }

  /**
   * Everything not handled above is forwarded to the monolith, which stays AUTHORITATIVE for its own routes until they move
   * (some are open to the phone app without any session - the `public`/`devotee` module routers answer before its gate -
   * and the BFF cannot know which, so it must not gate them blindly). This resolves who the caller is and signs it:
   *   valid session           -> token with { sub: operatorId, role, perms } (the monolith applies the area gate to it)
   *   no / invalid session    -> NO token (the monolith answers 401 "Sign in required" to a gated route, serves an open one)
   *   identity unreachable    -> token { ctx.authError:'unavailable' } -> the monolith answers a gated route 503 (never 401: that
   *                              would sign the operator out - and never open), and still serves an open route
   *   no operator, production -> token { ctx.authError:'no_operators' } -> 503, never open
   * The routes this BFF serves ITSELF (engagement, identity) are gated here, before anything is called.
   * PUBLIC (app) routes skip all of this. Mounted AFTER the BFF's own routers and BEFORE the catch-all proxy.
   */
  async function proxyGate(req, res, next) {
    try {
      if (isPublic(req.method, req.path)) return next();
      const s = await sessions.resolve(req);
      if (s.ok) {
        req.operatorForProxy = s.operator;
        const path = req.path;
        res.on('finish', () => audit({ operator: s.operator, method: req.method, path, status: res.statusCode, reqId: req.id }));
      } else if (s.status === 503) {
        req.operatorAuthError = s.body?.code === 'no_operators' ? 'no_operators' : 'unavailable';
      }
      next();
    } catch (e) {
      next(e);
    }
  }

  return {
    softDeps: { identity: () => probeUpstream(config.identityUrl, '/health') },
    sessions,
    audit,
    mount(app) {
      const r = express.Router();
      mountSessionRoutes(r);
      app.use(r);
    },
    /** Mounted by the BFF after the engagement operator routes (they share `sessions` + `audit`). */
    mountIdentityRoutes(app) {
      app.use(identityAdminRouter({ sessions, client, audit }));
    },
    mountGate(app) {
      app.use('/api', proxyGate);
    },
    proxyHeaders(req, headers) {
      delete headers.cookie;
      delete headers.authorization;
      if (!req.originalUrl.startsWith('/api')) return;
      const op = req.operatorForProxy;
      if (op) {
        headers.authorization = `Bearer ${signServiceToken({ iss: 'admin-bff', sub: op.id ?? op.username, role: op.role, perms: op.permissions, reqId: req.id, ctx: { username: op.username } }, { secret })}`;
      } else if (req.operatorAuthError) {
        headers.authorization = `Bearer ${signServiceToken({ iss: 'admin-bff', sub: null, reqId: req.id, ctx: { authError: req.operatorAuthError } }, { secret })}`;
      }
    },
  };
}

/**
 * The admin BFF never serves the phone's FCM registration. The old anonymous Expo route on the same path stays (it is public in the monolith's
 * allowlist, both BFFs serve it); the FCM contract - any DELETE, or any request carrying an Authorization header - is a plain 404 here.
 */
export function rejectFcmRegistration() {
  return (req, res, next) => {
    if (req.method === 'POST' && !req.headers.authorization) return next(); // the legacy anonymous Expo registration
    res.status(404).json({ error: 'not found', code: 'not_found' });
  };
}
