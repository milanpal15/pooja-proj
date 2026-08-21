import { Router } from 'express';

import { Event, Flag, Payment, Visitor } from './models.js';

export const router = Router();

/* --------------------------------------------------------------- flags -- */

// Public: the mobile app reads flags as a simple { key: bool } map.
router.get('/flags', async (_req, res) => {
  const flags = await Flag.find().lean();
  const map = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
  res.json({ flags: map });
});

// Admin: full flag docs (with labels/descriptions).
router.get('/flags/full', async (_req, res) => {
  res.json(await Flag.find().sort({ key: 1 }).lean());
});

// Admin: toggle / update a flag.
router.put('/flags/:key', async (req, res) => {
  const { enabled } = req.body ?? {};
  const flag = await Flag.findOneAndUpdate(
    { key: req.params.key },
    { $set: { enabled: !!enabled } },
    { new: true },
  );
  if (!flag) return res.status(404).json({ error: 'flag not found' });
  res.json(flag);
});

/* ------------------------------------------------------------ ingest -- */

// App reports a session start (upserts the visitor, bumps counters).
router.post('/ingest/session', async (req, res) => {
  const { deviceId, model, os, appVersion } = req.body ?? {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  await Visitor.updateOne(
    { deviceId },
    {
      $set: { model, os, appVersion, lastActive: new Date() },
      $setOnInsert: { firstSeen: new Date() },
      $inc: { sessions: 1 },
    },
    { upsert: true },
  );
  await Event.create({ type: 'session', deviceId });
  res.json({ ok: true });
});

// App reports a screen view.
router.post('/ingest/screen', async (req, res) => {
  const { deviceId, screen } = req.body ?? {};
  await Event.create({ type: 'screen', deviceId, screen });
  if (deviceId) await Visitor.updateOne({ deviceId }, { $set: { lastActive: new Date() } });
  res.json({ ok: true });
});

// App reports a (dummy) payment.
router.post('/ingest/payment', async (req, res) => {
  const { deviceId, amount, method, status, note } = req.body ?? {};
  const p = await Payment.create({ deviceId, amount, method, status, note });
  res.json({ ok: true, id: p._id });
});

/* --------------------------------------------------------- analytics -- */

router.get('/analytics/summary', async (_req, res) => {
  const [visitors, sessions, screenViews, payments, revenueAgg, topScreensAgg, recentPayments] =
    await Promise.all([
      Visitor.countDocuments(),
      Event.countDocuments({ type: 'session' }),
      Event.countDocuments({ type: 'screen' }),
      Payment.countDocuments(),
      Payment.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Event.aggregate([
        { $match: { type: 'screen' } },
        { $group: { _id: '$screen', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Payment.find().sort({ at: -1 }).limit(10).lean(),
    ]);

  const successPayments = await Payment.countDocuments({ status: 'success' });

  res.json({
    visitors,
    sessions,
    screenViews,
    payments,
    successPayments,
    revenue: revenueAgg[0]?.total ?? 0,
    topScreens: topScreensAgg.map((s) => ({ screen: s._id || '(unknown)', count: s.count })),
    recentPayments,
  });
});

router.get('/payments', async (_req, res) => {
  res.json(await Payment.find().sort({ at: -1 }).limit(100).lean());
});

router.get('/visitors', async (_req, res) => {
  res.json(await Visitor.find().sort({ lastActive: -1 }).limit(100).lean());
});

// 14-day session trend for the dashboard chart.
router.get('/analytics/trend', async (_req, res) => {
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
