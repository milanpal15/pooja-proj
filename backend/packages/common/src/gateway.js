/**
 * The phase-0 BFF: a thin authenticating-gateway-to-be in front of the monolith.
 * Mobile and admin differ only in name and (later) the routes/auth they add, so the app builder is shared.
 */
import express from 'express';

import { corsMiddleware } from './cors.js';
import { accessLog, errorHandler, health, requestId } from './express.js';
import { createLogger } from './logger.js';
import { createProxy, probeUpstream } from './proxy.js';

/**
 * @param {string} name  'mobile-bff' | 'admin-bff'
 * @param {{monolithUrl:string, corsOrigin:string, isProduction:boolean, commit:string|null, proxyTimeoutMs?:number}} config
 * @param {object} [o]
 * @param {(app: import('express').Express) => void} [o.mount]  registers the BFF's own routes; runs BEFORE the
 *        catch-all proxy, so a path it handles never reaches the monolith
 * @param {(req, headers: object) => void} [o.proxyHeaders]  rewrites the headers sent to the monolith (identity phase: swap the
 *        end user's credentials for the BFF's signed service token)
 * @param {Record<string, () => Promise<unknown>>} [o.softDeps]  services whose outage DEGRADES the BFF instead of
 *        taking it down: listed in /health/deps (503 when down) and as `degraded` in /api/health, never failing readiness
 */
export function createGatewayApp(name, config, { logger = createLogger(name), mount, softDeps = {}, proxyHeaders } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1); // same as the monolith: req.ip must be the real client

  app.use(requestId());
  app.use(accessLog(logger));
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    next();
  });
  app.use(corsMiddleware({ corsOrigin: config.corsOrigin, isProduction: config.isProduction, logger }));

  const upstream = () => probeUpstream(config.monolithUrl);

  // Same body as the monolith's /api/health, but 503 until the monolith behind us answers 200.
  app.get('/api/health', async (_req, res) => {
    let ok = true;
    try {
      await upstream();
    } catch {
      ok = false;
    }
    const degraded = [];
    await Promise.all(
      Object.entries(softDeps).map(([dep, probe]) => probe().catch(() => degraded.push(dep))),
    );
    res.status(ok ? 200 : 503).json({
      ok,
      ...(ok ? {} : { starting: true }),
      ...(degraded.length ? { degraded } : {}),
      uptime: process.uptime(),
      commit: config.commit,
    });
  });
  app.use(health({ isReady: () => upstream().then(() => true, () => false), deps: { monolith: upstream, ...softDeps }, commit: config.commit }));

  mount?.(app);

  // NOTE: deliberately no `GET /` handler (same as the monolith).
  const proxy = createProxy({ target: config.monolithUrl, timeoutMs: config.proxyTimeoutMs, logger, transformHeaders: proxyHeaders });
  app.use('/api', proxy);
  app.use('/uploads', proxy);

  app.use(errorHandler(logger));
  return app;
}
