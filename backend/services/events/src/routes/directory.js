import { Registration, UserBadge } from '../models/index.js';
import { asyncRouter } from './simple-crud.js';

/**
 * Read-only, by uid, for the identity service's Users 360 view (docs/USERS.md section 2). /internal/events/directory/*, `iss: identity` only (lib/perms.js).
 *
 *   GET /directory/users/:uid  -> { registrations:[{ eventSlug, status, joinedAt, checkedInAt, createdAt }], badges:[{ badgeSlug, eventSlug, earnedAt }] }   10 newest each
 *
 * Deliberately no registration `answers` (free-form form fields) and no pass code.
 */
export function directoryRoutes() {
  const router = asyncRouter();
  router.get('/users/:uid', async (req, res) => {
    const uid = req.params.uid;
    const [registrations, badges] = await Promise.all([
      Registration.find({ uid }).sort({ createdAt: -1 }).limit(10).select('eventSlug status joinedAt checkedInAt createdAt').lean(),
      UserBadge.find({ uid }).sort({ earnedAt: -1 }).limit(10).lean(),
    ]);
    res.json({
      registrations: registrations.map((g) => ({ eventSlug: g.eventSlug, status: g.status, joinedAt: g.joinedAt ?? null, checkedInAt: g.checkedInAt ?? null, createdAt: g.createdAt, at: g.createdAt, title: g.eventSlug })),
      badges: badges.map((b) => ({ badgeSlug: b.badgeSlug, eventSlug: b.eventSlug, earnedAt: b.earnedAt, at: b.earnedAt, title: b.badgeSlug })),
    });
  });
  return router;
}
