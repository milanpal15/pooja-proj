import mongoose from 'mongoose';

import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';
import { crud } from '../content/crud.factory.js';
import { createLimiter } from '../operators/login-limiter.js';
import { LiveCategory, LiveStream } from './live.model.js';
import { probeSoon, probeSource } from './probe.js';
import * as svc from './live.service.js';
import { cleanSourceUrl, prepareCategory, prepareStream } from './live.validate.js';

/** "Test link": 10 checks a minute per operator — each one makes the server fetch an address the operator typed. */
export const checkLimiter = createLimiter({ max: 10, windowMs: 60_000 });

const oid = (id) => mongoose.isValidObjectId(id);

function orderRoute(Model, noun) {
  return (r) =>
    r.put('/order', async (req, res) => {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length > 200 || !ids.every((i) => typeof i === 'string' && oid(i)) || new Set(ids).size !== ids.length) {
        throw new HttpError(400, 'bad_order', `ids must be a list of distinct ${noun} ids.`);
      }
      if ((await Model.countDocuments({ _id: { $in: ids } })) !== ids.length) throw new HttpError(404, 'not_found', `One of those ${noun}s does not exist.`);
      await Model.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: (i + 1) * 10 } } } })));
      const rows = await Model.find().sort({ order: 1, createdAt: 1 }).lean();
      res.json(Model === LiveStream ? rows.map((s) => svc.adminView(s)) : rows);
    });
}

/** Live darshan. See docs/LIVE_DARSHAN.md. */
export function liveRouters({ requireAuth }) {
  const pub = asyncRouter();
  const devotee = asyncRouter();
  const admin = asyncRouter();

  pub.get('/live', async (_req, res) => res.json(await svc.listPublic()));
  pub.get('/live/:slug', async (req, res) => res.json({ stream: await svc.detailPublic(req.params.slug) }));
  devotee.post('/live/:slug/jai', requireAuth, async (req, res) => res.json(await svc.sayJai(req.token.uid, req.params.slug)));

  // Save → check it now instead of in up to a minute (a no-op while the job is not running, e.g. in tests).
  admin.use('/admin/live-streams', (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') res.on('finish', () => res.statusCode < 300 && probeSoon());
    next();
  });
  admin.use(
    '/admin/live-streams',
    crud('LiveStream', LiveStream, undefined, {
      prepare: prepareStream,
      view: (s) => svc.adminView(s),
      routes: (r) => {
        orderRoute(LiveStream, 'stream')(r);
        r.post('/check', async (req, res) => {
          const key = req.operator?.username || 'anonymous';
          const gate = checkLimiter.check(key);
          if (gate.blocked) {
            res.set('Retry-After', String(gate.retryAfterSec));
            throw new HttpError(429, 'too_many_checks', 'Too many link checks. Try again in a minute.', { retryAfterSec: gate.retryAfterSec });
          }
          checkLimiter.fail(key); // counts the attempt
          const sourceType = req.body?.sourceType;
          const url = cleanSourceUrl(sourceType, req.body?.url);
          const r2 = await probeSource({ sourceType, url });
          const message =
            r2.broadcasting === true ? 'Broadcasting now.'
            : r2.broadcasting === false ? `Not broadcasting${r2.probeNote ? ` (${r2.probeNote})` : ''}.`
            : r2.probeNote || 'Live status could not be verified.';
          res.json({ ok: r2.broadcasting !== false, broadcasting: r2.broadcasting, viewers: r2.viewers, message });
        });
      },
    }),
  );
  admin.use('/admin/live-categories', crud('LiveCategory', LiveCategory, undefined, { prepare: prepareCategory, routes: orderRoute(LiveCategory, 'category') }));

  pub.use(httpErrorHandler);
  devotee.use(httpErrorHandler);
  admin.use(httpErrorHandler);
  return { public: pub, devotee, admin };
}
