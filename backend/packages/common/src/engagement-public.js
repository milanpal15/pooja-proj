/**
 * The app-facing routes that live in the engagement service (flags, announcements, analytics ingest, push
 * registration). Both BFFs mount this, because the monolith's PUBLIC allowlist (pooja-api/src/middleware/access.js)
 * is reachable through either: same paths, same methods, same response shapes, fail-closed (a path not listed
 * here is not handled here, and falls through to the monolith's own gate).
 *
 * Degraded mode, by design (docs/MICROSERVICES.md section 3, "degrade, never error into the app"):
 *   GET  /api/flags          engagement down -> 200 with the documented defaults (all on, `phoneAuth` off)
 *   GET  /api/announcements  engagement down -> 200 []
 *   POST ingest / register   engagement down -> 503 { error, code: 'engagement_unavailable' } (telemetry is
 *                            best-effort in the app and must not be silently pretended to be stored)
 * A degraded answer carries `x-degraded: engagement`.
 */
import express from 'express';

import { ServiceError } from './errors.js';

/** Mirrors engagement's DEFAULT_FLAGS (services/engagement/src/defaults.js): every flag on except `phoneAuth`. */
export const DEFAULT_FLAGS_MAP = Object.freeze({
  virtualPooja: true,
  bhajan: true,
  chadhava: true,
  journal: true,
  liveDarshan: true,
  payments: true,
  announcements: true,
  astrologerCalls: true,
  phoneAuth: false,
});

const READ_TIMEOUT_MS = 2500;
const NS = '/internal/engagement';

/**
 * @param {{ client: ReturnType<import('./client.js').createServiceClient>, logger?: object }} o
 */
export function engagementPublicRouter({ client, logger }) {
  const router = express.Router();
  const json = express.json(); // per route: the proxy behind us must still see untouched bodies

  const degrade = (res, e, what) => {
    logger?.warn(`engagement ${what} degraded: ${e?.code || e?.message}`);
    res.setHeader('x-degraded', 'engagement');
  };

  router.get('/api/flags', async (req, res) => {
    try {
      res.json(await client.get(`${NS}/flags`, { reqId: req.id, timeoutMs: READ_TIMEOUT_MS }));
    } catch (e) {
      degrade(res, e, 'flags');
      res.json({ flags: { ...DEFAULT_FLAGS_MAP } });
    }
  });

  router.get('/api/announcements', async (req, res) => {
    try {
      res.json(await client.get(`${NS}/announcements`, { reqId: req.id, timeoutMs: READ_TIMEOUT_MS }));
    } catch (e) {
      degrade(res, e, 'announcements');
      res.json([]);
    }
  });

  for (const path of ['/api/ingest/session', '/api/ingest/screen', '/api/push/register']) {
    router.post(path, json, async (req, res) => {
      try {
        res.json(await client.post(`${NS}${path.slice(4)}`, req.body ?? {}, { reqId: req.id, timeoutMs: READ_TIMEOUT_MS }));
      } catch (e) {
        // A 4xx from engagement is the caller's mistake (e.g. 400 deviceId required): pass it through unchanged.
        if (e instanceof ServiceError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403) {
          return res.status(e.status).json(e.body);
        }
        degrade(res, e, path);
        res.status(503).json({ error: 'engagement_unavailable', code: 'engagement_unavailable' });
      }
    });
  }
  return router;
}
