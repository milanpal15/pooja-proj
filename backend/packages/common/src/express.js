/** Express helpers shared by every service and BFF. */
import crypto from 'node:crypto';

import express from 'express';

import { AuthError, ServiceError } from './errors.js';
import { bearer, verifyServiceToken } from './jwt.js';

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reads `x-request-id` (when sane) or mints one; exposes `req.id` and echoes the header. */
export function requestId() {
  return (req, res, next) => {
    const given = req.headers['x-request-id'];
    req.id = typeof given === 'string' && SAFE_ID.test(given) ? given : crypto.randomUUID();
    res.setHeader('x-request-id', req.id);
    next();
  };
}

/** Logs one line per finished request. */
export function accessLog(logger) {
  return (req, res, next) => {
    const t = Date.now();
    res.on('finish', () => {
      logger.info(`${req.method} ${req.originalUrl.split('?')[0]}`, { status: res.statusCode, ms: Date.now() - t, reqId: req.id });
    });
    next();
  };
}

/** Verifies `Authorization: Bearer <service JWT>`; sets `req.auth` = the claims. Else 401 `{error, code}`. */
export function requireServiceAuth({ secret, issuers } = {}) {
  return (req, res, next) => {
    try {
      req.auth = verifyServiceToken(bearer(req.headers.authorization), { secret, issuers });
      if (req.auth.reqId && !req.headers['x-request-id']) req.id = req.auth.reqId;
      next();
    } catch (e) {
      next(e instanceof AuthError ? e : new AuthError('bad_signature', 'Invalid service token.'));
    }
  };
}

/** Last middleware. Produces `{error, code, ...extra}` and never leaks internals on a 500. */
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars -- Express recognises an error handler by its arity.
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof ServiceError) return res.status(err.status).json(err.body);
    if (err instanceof AuthError) return res.status(401).json({ error: err.message, code: err.code });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.', code: 'bad_json' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large.', code: 'too_large' });
    logger?.error(`unhandled ${err?.stack || err}`, { reqId: req.id });
    res.status(500).json({ error: 'Something went wrong.', code: 'internal' });
  };
}

/**
 * `GET /health`      200 only once `isReady()` is true, else 503 `{ok:false, starting:true}`.
 * `GET /health/deps` always 200/503 by dependency: `{ok, deps:{name:{ok, ms|error}}}`.
 *
 * @param {object} o
 * @param {() => boolean|Promise<boolean>} o.isReady
 * @param {Record<string, () => Promise<unknown>>} [o.deps]  each resolves when healthy, rejects when not
 * @param {string|null} [o.commit]
 */
export function health({ isReady, deps = {}, commit = null }) {
  const router = express.Router();
  router.get('/health', async (_req, res) => {
    const ready = Boolean(await isReady());
    res.status(ready ? 200 : 503).json({ ok: ready, ...(ready ? {} : { starting: true }), uptime: process.uptime(), commit });
  });
  router.get('/health/deps', async (_req, res) => {
    const out = {};
    await Promise.all(
      Object.entries(deps).map(async ([name, probe]) => {
        const t = Date.now();
        try {
          await probe();
          out[name] = { ok: true, ms: Date.now() - t };
        } catch (e) {
          out[name] = { ok: false, error: e?.code || e?.message || 'failed' };
        }
      }),
    );
    const ok = Object.values(out).every((d) => d.ok);
    res.status(ok ? 200 : 503).json({ ok, deps: out });
  });
  return router;
}
