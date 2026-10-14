import mongoose from 'mongoose';

import { asyncRouter } from '../lib/async-handler.js';
import { crud } from '../lib/crud.js';
import { requirePerm } from '../lib/perms.js';
import { Announcement, Visitor } from '../models/index.js';

const activeNow = (now) => ({
  active: true,
  channels: 'modal',
  $and: [
    { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
  ],
});

/** Public + read side. */
export const announcementRoutes = asyncRouter();

/** Everything the app should consider showing right now. */
announcementRoutes.get('/announcements', async (_req, res) => {
  res.json(await Announcement.find(activeNow(new Date())).sort({ createdAt: -1 }).limit(5).lean());
});

/** The newest live announcement, shaped as `GET /api/content` embeds it (the darshan banner). */
announcementRoutes.get('/announcements/current', async (_req, res) => {
  const a = await Announcement.findOne({ active: true }).sort({ createdAt: -1 }).lean();
  res.json({ announcement: a ? { title: a.title, body: a.bodyMd, severity: a.severity } : null });
});

/** Dashboard CRUD (the monolith's `/api/content/announcements`). */
export const announcementAdminRoutes = crud('Announcement', Announcement, { createdAt: -1 }, { write: [requirePerm('announcements:edit')] });

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

/**
 * Fan an announcement out over Expo Push. Guarded by `pushedAt` so re-publishing cannot double-send;
 * Expo takes up to 100 messages per request, so tokens are chunked.
 */
export function announcementPushRoutes({ expoPushUrl, fetchImpl = fetch }) {
  const r = asyncRouter();
  r.post('/admin/announcements/:id/push', requirePerm('push:edit'), async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'That id is not valid.' });
    const ann = await Announcement.findById(req.params.id);
    if (!ann) return res.status(404).json({ error: 'announcement not found' });
    if (ann.pushedAt && !req.query.force) return res.status(409).json({ error: 'already pushed', pushedAt: ann.pushedAt });

    const tokens = (await Visitor.find({ pushToken: { $ne: null } }).select('pushToken').lean())
      .map((v) => v.pushToken)
      .filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
    if (!tokens.length) return res.json({ ok: true, sent: 0, failed: 0, note: 'no registered devices' });

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
        const out = await (await fetchImpl(expoPushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
        })).json();
        (Array.isArray(out?.data) ? out.data : []).forEach((x) => (x.status === 'ok' ? sent++ : failed++));
      } catch {
        failed += batch.length;
      }
    }
    ann.pushedAt = new Date();
    ann.pushStats = { sent, failed };
    await ann.save();
    res.json({ ok: true, sent, failed });
  });
  return r;
}
