/**
 * Everything a BFF needs to put the catalog service behind its `/api` and `/uploads` surface (phase 3), in one call, so the
 * mobile and admin BFFs cannot drift:
 *
 *   - `GET /api/content`   assembled HERE (catalog bundle + engagement settings + announcement), byte-identical to the monolith's.
 *                          Stale-while-error: the last good body is served with `x-degraded: catalog` for up to 60 minutes.
 *   - the app's read routes (horoscope, panchang, live, poojas, chadhava listings/offerings) - same stale-while-error rule,
 *                          shorter for live (a "live now" flag must not outlive its truth).
 *   - `POST /api/live/:slug/jai`   (mobile BFF with the identity edge): the devotee's uid is the signed `sub`.
 *   - `GET|HEAD /uploads/:file`    STREAMED from catalog (Range 206/416, ETag/304, immutable, nosniff, CSP sandbox all come from
 *                          catalog's media route, byte for byte as the monolith served them). Catalog down = 503 `catalog_unavailable`.
 *   - the operator routes (content CRUD, poojas, chadhava listings/categories/offerings, Home layout, live streams/categories,
 *     horoscope day editor, media delete) behind the area gate, audited; `POST /api/content/upload` is STREAMED (multipart is
 *     never parsed here).
 *
 * Returns `null` when CATALOG_URL is unset: the BFF is then exactly as before (the monolith serves all of it).
 */
import express from 'express';

import { assembleContent, createEngagementReaders } from './catalog-content.js';
import { CATALOG_ADMIN_ROUTES, CATALOG_PUBLIC_GETS } from './catalog-routes.js';
import { createServiceClient } from './client.js';
import { ServiceError } from './errors.js';
import { etagMatches, jsonEtag } from './etag.js';
import { signServiceToken } from './jwt.js';
import { createAuditor } from './operator/audit.js';
import { createOperatorGate, engagementAdminRouter } from './operator/engagement-routes.js';
import { createSessionResolver } from './operator/operator-session.js';
import { createProxy, probeUpstream } from './proxy.js';

export const CATALOG_NS = '/internal/catalog';
export const CONTENT_STALE_MS = 60 * 60_000;
/** A last good Home layout may be served this long if catalog is down (the app also keeps its own cache + a bundled default). */
export const HOME_STALE_MS = 60 * 60_000;

const CACHE_MAX = 300;
const UNAVAILABLE = { error: 'catalog_unavailable', code: 'catalog_unavailable' };

const stringQuery = (q) => {
  const entries = Object.entries(q ?? {}).filter(([, v]) => typeof v === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/**
 * @param {string} iss  'mobile-bff' | 'admin-bff'
 * @param {{catalogUrl:string, engagementUrl:string, internalJwtSecret:string, serviceTimeoutMs?:number, proxyTimeoutMs?:number, monolithUrl:string}} config
 * @param {object} [o]
 * @param {false|{sessions:object, audit:Function}} [o.operator]  `false` = this BFF serves no operator routes (mobile, identity mode);
 *        `{sessions, audit}` = the admin BFF's identity-backed ones; omitted = phase 1/2 legacy (the monolith owns session + audit)
 * @param {{requireDevotee:Function, asDevotee:Function}|null} [o.devotee]  the mobile BFF's identity edge (Jai needs a devotee)
 */
export function createCatalogMount(iss, config, { logger, fetchImpl, operator, devotee = null, now = () => Date.now() } = {}) {
  if (!config.catalogUrl) return null;
  const extra = fetchImpl ? { fetchImpl } : {};
  const mk = (service, baseUrl) =>
    createServiceClient({ service, baseUrl, iss, secret: config.internalJwtSecret, timeoutMs: config.serviceTimeoutMs, ...extra });
  const client = mk('catalog', config.catalogUrl);
  const readers = createEngagementReaders(mk('engagement', config.engagementUrl), { logger });
  const secret = config.internalJwtSecret;

  const legacy = operator === undefined;
  const sessions = legacy ? createSessionResolver({ monolithUrl: config.monolithUrl, timeoutMs: config.serviceTimeoutMs, ...extra }) : operator?.sessions;
  const audit = legacy
    ? createAuditor({ iss, monolithUrl: config.monolithUrl, logger, signToken: (claims) => signServiceToken(claims, { secret }), ...extra })
    : operator?.audit;

  const lastGood = new Map(); // request URL -> { at, body }
  const remember = (key, body) => {
    if (lastGood.size >= CACHE_MAX) lastGood.delete(lastGood.keys().next().value);
    lastGood.set(key, { at: now(), body });
  };
  const usable = (e) => e instanceof ServiceError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403;

  /** Answer from the last good body (flagged) if it is young enough, else a clean 503. */
  function degrade(res, key, maxStaleMs, e, what) {
    logger?.warn(`catalog ${what} degraded: ${e?.code || e?.message}`);
    const hit = lastGood.get(key);
    if (hit && now() - hit.at < maxStaleMs) {
      res.setHeader('x-degraded', 'catalog');
      return res.json(hit.body);
    }
    return res.status(503).json(UNAVAILABLE);
  }

  function mountPublic(app) {
    const router = express.Router();

    router.get('/api/content', async (req, res) => {
      const key = req.originalUrl;
      try {
        // Settings / announcement never throw (cached, defaulted); only the catalog bundle can fail the request.
        const [bundle, settings, announcement] = await Promise.all([
          client.get(`${CATALOG_NS}/public/content`, { reqId: req.id }),
          readers.settings(),
          readers.announcement(),
        ]);
        const body = assembleContent(bundle, settings, announcement);
        remember(key, body);
        res.json(body);
      } catch (e) {
        if (usable(e)) return res.status(e.status).json(e.body);
        degrade(res, key, CONTENT_STALE_MS, e, 'content');
      }
    });

    /* GET /api/home?lang=en|hi - the server-driven Home layout (docs/HOME_LAYOUT.md section 4). Public, no auth. ETag + 304 are done HERE
       over the body (304 when If-None-Match matches), so they hold on a stale-while-error answer too. */
    router.get('/api/home', async (req, res) => {
      const lang = req.query.lang === 'en' || req.query.lang === 'hi' ? req.query.lang : undefined;
      const key = `/api/home?lang=${lang ?? ''}`;
      const send = (body) => {
        const etag = jsonEtag(body);
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, max-age=60');
        if (etagMatches(req.headers['if-none-match'], etag)) return res.status(304).end();
        res.json(body);
      };
      try {
        const body = await client.get(`${CATALOG_NS}/public/home`, { reqId: req.id, query: lang ? { lang } : undefined });
        remember(key, body);
        send(body);
      } catch (e) {
        if (usable(e)) return res.status(e.status).json(e.body);
        logger?.warn(`catalog home degraded: ${e?.code || e?.message}`);
        const hit = lastGood.get(key);
        if (hit && now() - hit.at < HOME_STALE_MS) {
          res.setHeader('x-degraded', 'catalog');
          return send(hit.body);
        }
        res.status(503).json(UNAVAILABLE);
      }
    });

    for (const { path, maxStaleMs } of CATALOG_PUBLIC_GETS) {
      router.get(`/api${path}`, async (req, res) => {
        const key = req.originalUrl;
        try {
          const body = await client.get(`${CATALOG_NS}${req.path.replace(/^\/api/, '')}`, { reqId: req.id, query: stringQuery(req.query) });
          remember(key, body);
          res.json(body);
        } catch (e) {
          // 404 not_found, 400 ... are the caller's / the data's answer: pass them through unchanged.
          if (usable(e)) return res.status(e.status).json(e.body);
          degrade(res, key, maxStaleMs, e, path);
        }
      });
    }

    if (devotee) {
      const json = express.json({ limit: '4kb' });
      router.post('/api/live/:slug/jai', devotee.requireDevotee, json, async (req, res) => {
        try {
          res.json(await client.post(`${CATALOG_NS}/live/${encodeURIComponent(req.params.slug)}/jai`, {}, { reqId: req.id, as: devotee.asDevotee(req.deviceAuth) }));
        } catch (e) {
          if (usable(e)) return res.status(e.status).json(e.body);
          logger?.warn(`catalog jai failed: ${e?.code || e?.message}`);
          res.status(503).json(UNAVAILABLE);
        }
      });
    }

    /* /uploads: streamed from catalog's media route. Only `GET|HEAD /uploads/<file>` exists; the monolith's had nothing else. */
    const media = createProxy({
      target: config.catalogUrl,
      timeoutMs: config.proxyTimeoutMs,
      logger,
      pathFor: (req) => `${CATALOG_NS}/media/${encodeURIComponent(req.params.file)}`,
      unavailable: { status: 503, error: 'catalog_unavailable' },
      transformHeaders: (req, headers) => {
        delete headers.cookie;
        delete headers.authorization;
        headers.authorization = `Bearer ${signServiceToken({ iss, reqId: req.id }, { secret })}`;
      },
    });
    router.get('/uploads/:file', media);
    router.use('/uploads', (_req, res) => res.status(404).json({ error: 'not found' }));
    app.use(router);
  }

  function mountOperator(app) {
    if (operator === false) return;
    app.use(engagementAdminRouter({ sessions, client, audit, routes: CATALOG_ADMIN_ROUTES, namespace: CATALOG_NS }));

    // The multipart upload: gated and audited here, then STREAMED to catalog untouched (it alone parses it, with the size limit).
    const gate = createOperatorGate(sessions);
    const upload = createProxy({
      target: config.catalogUrl,
      timeoutMs: config.proxyTimeoutMs,
      logger,
      pathFor: () => `${CATALOG_NS}/content/upload`,
      unavailable: { status: 503, error: 'catalog_unavailable' },
      transformHeaders: (req, headers) => {
        delete headers.cookie;
        const op = req.operator;
        headers.authorization = `Bearer ${signServiceToken({ iss, sub: op.id ?? op.username, role: op.role, perms: op.permissions, reqId: req.id, ctx: { username: op.username } }, { secret })}`;
      },
    });
    app.post('/api/content/upload', gate, (req, res) => {
      res.on('finish', () => audit?.({ operator: req.operator, method: 'POST', path: '/content/upload', status: res.statusCode }));
      upload(req, res);
    });
  }

  return {
    softDeps: { catalog: () => probeUpstream(config.catalogUrl, '/health') },
    mount(app) {
      mountPublic(app);
      mountOperator(app);
    },
    _lastGood: lastGood,
  };
}
