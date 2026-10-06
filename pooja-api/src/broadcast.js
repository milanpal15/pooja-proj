import { Router } from 'express';

import { Announcement, Policy, User, Visitor } from './models.js';

/**
 * Rules & regulations, and broadcast announcements.
 *
 * Two things devotees see that nobody writes in code: the policy they accept
 * at sign-up, and the notices you push out afterwards. Both are authored as
 * Markdown in the dashboard and rendered by the app.
 */

/* ═══════════════════════════════════════════════════════════ policies ═══ */

export const policies = Router();

/** The seed rules, inserted once so the dashboard opens on something real. */
const DEFAULT_TERMS = `## Rules & Regulations

Welcome to **Divine Temple Portal**. By continuing you agree to the following.

### 1. Devotional conduct
- Treat the app, its imagery and its rituals with the same respect you would
  show inside a temple.
- Do not misuse deity artwork, aarti audio or temple names outside the app.

### 2. Offerings and bookings
- An **e-Chadhava** offering is a donation to the named temple.
- A **pooja booking** is a request for a priest to perform a seva on your
  behalf on the date you choose. Timings follow the temple's own schedule and
  may shift with festival days.
- Your name and *gotra* are recited during the sankalp exactly as you enter
  them. Please check them before paying.

### 3. Payments and refunds
- Payments are processed by our payment partner. We never store your card or
  UPI credentials.
- A booking may be cancelled up to **24 hours** before the scheduled date for
  a full refund. Offerings, once made, cannot be refunded.

### 4. Your information
- We store your name, contact and booking history to deliver the services you
  ask for.
- We never sell your information.

### 5. Availability
- Live darshan streams depend on each temple's connectivity and may be
  interrupted.
- Booking is arranged temple by temple and may not be available everywhere.

_Questions? Reach us from **Profile → Help & Support**._
`;

export async function seedPolicies() {
  await Policy.updateOne(
    { key: 'terms' },
    {
      $setOnInsert: {
        key: 'terms',
        title: 'Rules & Regulations',
        bodyMd: DEFAULT_TERMS,
        version: 1,
        publishedAt: new Date(),
      },
    },
    { upsert: true },
  );
}

/** Public: the app fetches the current policy to render and to compare versions. */
policies.get('/policy/:key', async (req, res) => {
  const doc = await Policy.findOne({ key: req.params.key }).lean();
  if (!doc) return res.status(404).json({ error: 'policy not found' });
  res.json(doc);
});

/** Admin: list every policy. */
policies.get('/admin/policies', async (_req, res) => {
  res.json(await Policy.find().sort({ key: 1 }).lean());
});

/**
 * Admin: save a policy.
 *
 * `?publish=1` bumps the version, which invalidates every prior acceptance
 * and forces devotees to read it again. Saving without publishing is for
 * typos — it must not nag the whole user base.
 */
policies.put('/admin/policies/:key', async (req, res) => {
  const { title, bodyMd } = req.body ?? {};
  const publish = req.query.publish === '1';

  const current = await Policy.findOne({ key: req.params.key });
  const update = { title, bodyMd };
  if (publish) {
    update.version = (current?.version ?? 0) + 1;
    update.publishedAt = new Date();
  }

  const doc = await Policy.findOneAndUpdate(
    { key: req.params.key },
    { $set: update },
    { new: true, upsert: true },
  );
  res.json(doc);
});

/** App: record that this devotee accepted a policy version. */
policies.post('/policy/:key/accept', async (req, res) => {
  const { contact, version } = req.body ?? {};
  if (!contact) return res.status(400).json({ error: 'contact required' });
  await User.updateOne(
    { contact },
    { $set: { [`acceptedPolicies.${req.params.key}`]: Number(version) || 1 } },
  );
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════ announcements ═══ */

export const announcements = Router();

/** Public: everything the app should consider showing right now. */
announcements.get('/announcements', async (_req, res) => {
  const now = new Date();
  const rows = await Announcement.find({
    active: true,
    channels: 'modal',
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  res.json(rows);
});

/** App: register this device's Expo push token. */
announcements.post('/push/register', async (req, res) => {
  const { deviceId, pushToken } = req.body ?? {};
  if (!deviceId || !pushToken) return res.status(400).json({ error: 'deviceId and pushToken required' });
  await Visitor.updateOne({ deviceId }, { $set: { pushToken } }, { upsert: true });
  res.json({ ok: true });
});

/**
 * Admin: fan an announcement out over Expo Push.
 *
 * Guarded by `pushedAt` so re-publishing cannot double-send. Expo's API takes
 * up to 100 messages per request, so tokens are chunked.
 */
announcements.post('/admin/announcements/:id/push', async (req, res) => {
  const ann = await Announcement.findById(req.params.id);
  if (!ann) return res.status(404).json({ error: 'announcement not found' });
  if (ann.pushedAt && !req.query.force) {
    return res.status(409).json({ error: 'already pushed', pushedAt: ann.pushedAt });
  }

  const tokens = (
    await Visitor.find({ pushToken: { $ne: null } }).select('pushToken').lean()
  )
    .map((v) => v.pushToken)
    .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));

  if (!tokens.length) {
    return res.json({ ok: true, sent: 0, failed: 0, note: 'no registered devices' });
  }

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100).map((to) => ({
      to,
      title: ann.title,
      body: plainPreview(ann.bodyMd),
      data: { announcementId: String(ann._id) },
      sound: 'default',
    }));
    try {
      const r = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      const out = await r.json();
      const results = Array.isArray(out?.data) ? out.data : [];
      results.forEach((x) => (x.status === 'ok' ? sent++ : failed++));
    } catch {
      failed += batch.length;
    }
  }

  ann.pushedAt = new Date();
  ann.pushStats = { sent, failed };
  await ann.save();
  res.json({ ok: true, sent, failed });
});

/** Markdown is for the app; a notification body needs flat text. */
function plainPreview(md = '', max = 160) {
  const flat = String(md)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_`~-]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
