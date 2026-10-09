import { asyncRouter } from '../../lib/async-handler.js';
import { Visitor } from '../../models.js';
import { Announcement } from './announcement.model.js';

/**
 * Broadcast announcements: the notices you push out to devotees, authored as
 * Markdown in the dashboard and rendered by the app.
 */
export const announcements = asyncRouter();

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
  // Strings only: this route is public, and an object here would be read as a
  // query operator rather than a value.
  if (typeof deviceId !== 'string' || typeof pushToken !== 'string' || !deviceId || !pushToken) {
    return res.status(400).json({ error: 'deviceId and pushToken required' });
  }
  await Visitor.updateOne({ deviceId: deviceId.slice(0, 120) }, { $set: { pushToken: pushToken.slice(0, 200) } }, { upsert: true });
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
