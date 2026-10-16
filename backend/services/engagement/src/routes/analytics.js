import { asyncRouter } from '../lib/async-handler.js';
import { can, requirePerm } from '../lib/perms.js';
import { Event, Visitor } from '../models/index.js';

export const analyticsRoutes = asyncRouter();

/**
 * A plain, bounded string - or undefined. The ingest routes are public (the app has no account), so a body
 * field can be anything JSON allows; an object such as {"$ne":null} would be a query operator, so only
 * strings get through, length-capped.
 */
const str = (v, max = 120) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);

analyticsRoutes.post('/ingest/session', async (req, res) => {
  const deviceId = str(req.body?.deviceId);
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await Visitor.updateOne(
    { deviceId },
    {
      $set: { model: str(req.body?.model), os: str(req.body?.os), appVersion: str(req.body?.appVersion, 40), lastActive: new Date(), lastSeen: new Date() },
      $setOnInsert: { firstSeen: new Date() },
      $inc: { sessions: 1 },
    },
    { upsert: true },
  );
  await Event.create({ type: 'session', deviceId });
  res.json({ ok: true });
});

analyticsRoutes.post('/ingest/screen', async (req, res) => {
  const deviceId = str(req.body?.deviceId);
  const screen = str(req.body?.screen);
  await Event.create({ type: 'screen', deviceId, screen });
  if (deviceId) await Visitor.updateOne({ deviceId }, { $set: { lastActive: new Date(), lastSeen: new Date() } });
  res.json({ ok: true });
});

/** The app registers this device's Expo push token. */
analyticsRoutes.post('/push/register', async (req, res) => {
  const { deviceId, pushToken } = req.body ?? {};
  if (typeof deviceId !== 'string' || typeof pushToken !== 'string' || !deviceId || !pushToken) {
    return res.status(400).json({ error: 'deviceId and pushToken required' });
  }
  await Visitor.updateOne({ deviceId: deviceId.slice(0, 120) }, { $set: { pushToken: pushToken.slice(0, 200) } }, { upsert: true });
  res.json({ ok: true });
});

/** Other services (the monolith's push helpers) ask for one device's token. */
analyticsRoutes.get('/visitors/:deviceId/push-token', async (req, res) => {
  const v = await Visitor.findOne({ deviceId: req.params.deviceId, pushToken: { $ne: null } }).select('pushToken').lean();
  res.json({ pushToken: v?.pushToken ?? null });
});

analyticsRoutes.get('/analytics/summary', requirePerm('overview:view'), async (_req, res) => {
  const [visitors, sessions, screenViews, topScreensAgg] = await Promise.all([
    Visitor.countDocuments(),
    Event.countDocuments({ type: 'session' }),
    Event.countDocuments({ type: 'screen' }),
    Event.aggregate([
      { $match: { type: 'screen' } },
      { $group: { _id: '$screen', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
  ]);
  res.json({
    visitors,
    sessions,
    screenViews,
    topScreens: topScreensAgg.map((s) => ({ screen: s._id || '(unknown)', count: s.count })),
  });
});

/** Device push tokens let whoever holds them notify that device: only `overview:edit` sees them. */
analyticsRoutes.get('/visitors', requirePerm('overview:view'), async (req, res) => {
  const rows = await Visitor.find().sort({ lastActive: -1 }).limit(100).lean();
  res.json(can(req, 'overview:edit') ? rows : rows.map(({ pushToken: _t, ...rest }) => rest));
});

/** 14-day session trend for the dashboard chart. */
analyticsRoutes.get('/analytics/trend', requirePerm('overview:view'), async (_req, res) => {
  const since = new Date(Date.now() - 14 * 864e5);
  const rows = await Event.aggregate([
    { $match: { type: 'session', at: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json(rows.map((r) => ({ day: r._id, count: r.count })));
});
