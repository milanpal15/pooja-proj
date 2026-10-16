import { asyncRouter } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { Visitor } from '../models/index.js';

const onlyIdentity = (req, _res, next) =>
  req.auth?.iss === 'identity' ? next() : next(new HttpError(403, 'wrong_issuer', 'This route is not available to that caller.'));

const iso = (d) => (d ? new Date(d).toISOString() : null);
const MAX_UIDS = 1000;
const MAX_VERSION_UIDS = 5000;

/**
 * The device registry, read by the identity service for the Users list / 360 view (docs/USERS.md section 2). Mounted at /devices. READ ONLY, identity
 * only, and narrow on purpose: no push token ever leaves here, and a row without a signed-in account (`uid` null) is not reachable through it.
 *
 *   POST /by-uids  { uids:[<=1000] }          -> { devices:[{ uid, deviceId, platform, versionName, versionCode, osApi, model, firstSeen, lastSeen }] }  (newest first)
 *   GET  /uids?versionCode=N&limit=<=5000     -> { uids:[...], truncated }   accounts whose device reported that build (most recently seen first)
 */
export function deviceRoutes() {
  const r = asyncRouter();
  r.use(onlyIdentity);

  r.post('/by-uids', async (req, res) => {
    const uids = req.body?.uids;
    if (!Array.isArray(uids) || uids.length > MAX_UIDS || uids.some((u) => typeof u !== 'string' || !u || u.length > 128)) {
      throw new HttpError(400, 'bad_request', `uids[] (strings, at most ${MAX_UIDS}) required.`);
    }
    if (!uids.length) return res.json({ devices: [] });
    const rows = await Visitor.find({ uid: { $in: uids } })
      .select('uid deviceId platform versionName versionCode osApi model firstSeen lastSeen lastActive pushToken')
      .sort({ lastSeen: -1 })
      .limit(MAX_UIDS * 3)
      .lean();
    res.json({
      devices: rows.map((d) => ({
        uid: d.uid, deviceId: d.deviceId, platform: d.platform ?? null, versionName: d.versionName ?? null, versionCode: d.versionCode ?? null,
        osApi: d.osApi ?? null, model: d.model ?? null, firstSeen: iso(d.firstSeen), lastSeen: iso(d.lastSeen ?? d.lastActive), hasPush: !!d.pushToken,
      })),
    });
  });

  r.get('/uids', async (req, res) => {
    const code = Number(req.query.versionCode);
    if (!Number.isInteger(code) || code < 0) throw new HttpError(400, 'bad_request', 'versionCode (a whole number) required.');
    const limit = Math.min(Math.max(Number(req.query.limit) || MAX_VERSION_UIDS, 1), MAX_VERSION_UIDS);
    const rows = await Visitor.find({ versionCode: code, uid: { $ne: null } }).select('uid').sort({ lastSeen: -1 }).limit(limit + 1).lean();
    const uids = [...new Set(rows.map((d) => d.uid))];
    res.json({ uids: uids.slice(0, limit), truncated: rows.length > limit });
  });
  return r;
}
