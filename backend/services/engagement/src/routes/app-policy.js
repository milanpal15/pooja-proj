import { evaluatePolicy, intOrNull } from '@bhakti/common';

import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { getPolicy, releaseNames } from '../lib/control.js';
import { fieldsOf, istDay } from '../lib/policy.js';
import { Visitor, VersionBlockCount } from '../models/index.js';

/** A plain, bounded string - or undefined (these bodies come from a phone via the BFF, so nothing is trusted). */
const str = (v, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

const onlyMobileBff = (req, _res, next) =>
  req.auth?.iss === 'mobile-bff' ? next() : next(new HttpError(403, 'wrong_issuer', 'This route is not available to that caller.'));

/**
 * What the mobile BFF needs (docs/RELEASES.md sections 3-4), mounted at /internal/engagement/policy:
 *   GET  /                the policy + the release names, for the BFF's in-memory gate (refreshed every 30 s)
 *   POST /evaluate        the public `GET /api/app/policy`: upserts the device row, answers the decision
 *   POST /blocked-counts  the gate's per-build refusals, flushed every 60 s
 */
export function appPolicyRoutes({ now = () => new Date() } = {}) {
  const r = asyncRouter();
  r.use(onlyMobileBff);

  r.get('/', async (_req, res) => {
    const [policy, names] = await Promise.all([getPolicy(), releaseNames()]);
    res.json({
      policy: { platform: policy.platform, ...fieldsOf(policy), version: policy.version },
      releases: [...names].map(([versionCode, versionName]) => ({ versionCode, versionName })),
    });
  });

  r.post('/evaluate', async (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const platform = str(b.platform, 16)?.toLowerCase() ?? 'android';
    const versionCode = intOrNull(b.versionCode);
    const osApi = intOrNull(b.osApi);
    const uid = str(b.uid, 128) ?? null;
    const at = now();

    const deviceId = str(b.deviceId);
    if (deviceId && platform === 'android') {
      const set = { platform, lastSeen: at, lastActive: at };
      if (versionCode !== null) set.versionCode = versionCode;
      if (osApi !== null) set.osApi = osApi;
      const versionName = str(b.versionName, 40);
      if (versionName) { set.versionName = versionName; set.appVersion = versionName; }
      const model = str(b.model, 80);
      if (model) set.model = model;
      if (uid) set.uid = uid;
      await Visitor.updateOne({ deviceId }, { $set: set, $setOnInsert: { firstSeen: at } }, { upsert: true });
    }

    const [policy, names] = await Promise.all([getPolicy(), releaseNames()]);
    const decision = platform === 'android'
      ? evaluatePolicy(fieldsOf(policy), { versionCode: b.versionCode, osApi: b.osApi, uid, now: at, names })
      : evaluatePolicy(null, {});
    res.json(decision);
  });

  r.post('/blocked-counts', async (req, res) => {
    const list = req.body?.counts;
    if (!Array.isArray(list) || list.length > 200) throw new HttpError(400, 'bad_request', 'counts[] (at most 200) required.');
    const day = istDay(now());
    const ops = [];
    for (const c of list) {
      const count = Number.isInteger(c?.count) && c.count >= 1 && c.count <= 1_000_000 ? c.count : 0;
      if (!count) continue;
      const versionCode = c.versionCode === null || c.versionCode === undefined ? null : intOrNull(c.versionCode);
      ops.push({ updateOne: { filter: { platform: 'android', versionCode, day }, update: { $inc: { count } }, upsert: true } });
    }
    if (ops.length) await VersionBlockCount.bulkWrite(ops, { ordered: false });
    res.json({ ok: true, accepted: ops.length });
  });

  return r;
}
