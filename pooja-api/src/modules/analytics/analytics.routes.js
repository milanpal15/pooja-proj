import { redactVisitors } from '../../access/redact.js';
import { asyncRouter } from '../../lib/async-handler.js';
import { Event, Visitor } from './analytics.model.js';

/** Ingest from the app, plus the dashboard's analytics and visitors reads. */
export const analytics = asyncRouter();

/**
 * A plain, bounded string — or undefined.
 *
 * These ingest routes are public (the app calls them with no account), so a
 * body field can be anything JSON allows. An object such as `{"$ne":null}` in a
 * query position is a NoSQL operator, not a value, so only strings get through,
 * and they are length-capped so a client cannot make the database store megabytes.
 */
const str = (v, max = 120) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);

/* ------------------------------------------------------------ ingest -- */

// App reports a session start (upserts the visitor, bumps counters).
analytics.post('/ingest/session', async (req, res) => {
  const deviceId = str(req.body?.deviceId);
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await Visitor.updateOne(
    { deviceId },
    {
      $set: { model: str(req.body?.model), os: str(req.body?.os), appVersion: str(req.body?.appVersion, 40), lastActive: new Date() },
      $setOnInsert: { firstSeen: new Date() },
      $inc: { sessions: 1 },
    },
    { upsert: true },
  );
  await Event.create({ type: 'session', deviceId });
  res.json({ ok: true });
});

// App reports a screen view.
analytics.post('/ingest/screen', async (req, res) => {
  const deviceId = str(req.body?.deviceId);
  const screen = str(req.body?.screen);
  await Event.create({ type: 'screen', deviceId, screen });
  if (deviceId) await Visitor.updateOne({ deviceId }, { $set: { lastActive: new Date() } });
  res.json({ ok: true });
});

// There is deliberately no `POST /ingest/payment`. It used to accept any body from
// anyone and fed the dashboard's revenue figure, so a stranger could forge
// revenue. Real money is a CoinOrder (verified with the gateway) and a ledger row; the dashboard reads those
// from `/admin/coin-orders` and `/admin/coin-stats`.

/* --------------------------------------------------------- analytics -- */

analytics.get('/analytics/summary', async (_req, res) => {
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

analytics.get('/visitors', async (req, res) => {
  res.json(redactVisitors(await Visitor.find().sort({ lastActive: -1 }).limit(100).lean(), req));
});

// 14-day session trend for the dashboard chart.
analytics.get('/analytics/trend', async (_req, res) => {
  const since = new Date(Date.now() - 14 * 864e5);
  const rows = await Event.aggregate([
    { $match: { type: 'session', at: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json(rows.map((r) => ({ day: r._id, count: r.count })));
});
