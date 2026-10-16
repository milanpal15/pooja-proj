import { Badge, EventType } from '../models/index.js';

/** What event validation looks up: our own types and badges, plus the injectable catalog client. */
export const createLookups = (catalog) => ({
  typeExists: async (slug) => !!(await EventType.exists({ slug })),
  badgeSlugs: async (slugs) => new Set((await Badge.find({ slug: { $in: slugs } }, { slug: 1 }).lean()).map((b) => b.slug)),
  catalog,
});
