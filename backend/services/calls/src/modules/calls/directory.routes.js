import { asyncRouter } from '../../lib/async-handler.js';
import { CallSession } from './call.model.js';

/**
 * Read-only, by uid, for the identity service's Users 360 view (docs/USERS.md section 2). /internal/calls/directory/users/:uid/calls, `iss: identity` only
 * (lib/perms.js). Calls the person made as a devotee AND calls they took as an astrologer:
 *
 *   GET /directory/users/:uid/calls -> { total, recent:[{ id, as:'devotee'|'astrologer', with, status, endReason, minutesBilled, coinsCharged, requestedAt, endedAt }] }   10 newest
 *
 * `with` is the astrologer's public name when the person was the caller; when they were the astrologer it is null (the caller's name is not for this view).
 */
export function callDirectoryRoutes() {
  const r = asyncRouter();
  r.get('/directory/users/:uid/calls', async (req, res) => {
    const uid = req.params.uid;
    const where = { $or: [{ devoteeUid: uid }, { astrologerUid: uid }] };
    const [total, rows] = await Promise.all([
      CallSession.countDocuments(where),
      CallSession.find(where).sort({ requestedAt: -1 }).limit(10).select('devoteeUid astrologerName status endReason minutesBilled coinsCharged requestedAt endedAt').lean(),
    ]);
    res.json({
      total,
      recent: rows.map((c) => {
        const asDevotee = c.devoteeUid === uid;
        return {
          id: String(c._id), as: asDevotee ? 'devotee' : 'astrologer', with: asDevotee ? c.astrologerName || null : null, status: c.status,
          endReason: c.endReason ?? null, minutesBilled: c.minutesBilled ?? 0, coinsCharged: c.coinsCharged ?? 0, requestedAt: c.requestedAt, endedAt: c.endedAt ?? null, at: c.requestedAt, coins: c.coinsCharged ?? 0,
        };
      }),
    });
  });
  return r;
}
