import { EventType } from './models/index.js';

/**
 * The four starting presets. They are PRESETS (colour + default blocks): nothing in code branches on their slugs, and an operator
 * can add, rename or disable any of them. Seeded only into an EMPTY collection - an operator who deleted one never gets it back.
 * No sample events are ever seeded (the list is honest: empty until someone publishes).
 */
export const DEFAULT_EVENT_TYPES = [
  {
    slug: 'garba-night', name: 'Garba Night', nameHi: 'गरबा नाइट', color: '#B8321E', gradient: ['#B8321E', '#E8913A'], order: 1,
    description: 'An in-person evening: a venue, a free pass, a few things to do on the night.',
    defaults: { blocks: ['schedule', 'venue', 'registration', 'milestones', 'rewards'], schedule: { mode: 'single' }, registration: { mode: 'free', pass: true, fields: [] }, milestones: { order: 'any', missed: 'catch_up_next', items: [] }, rewards: [] },
  },
  {
    slug: 'yatra', name: 'Yatra', nameHi: 'यात्रा', color: '#7A1F2B', gradient: ['#7A1F2B', '#C9772E'], order: 2,
    description: 'A journey over several days with something to do each day.',
    defaults: { blocks: ['schedule', 'milestones', 'rewards', 'content'], schedule: { mode: 'multiday' }, milestones: { order: 'daily', missed: 'catch_up_next', items: [] }, rewards: [] },
  },
  {
    slug: 'vrat', name: 'Vrat', nameHi: 'व्रत', color: '#3F5F46', gradient: ['#3F5F46', '#7FA06A'], order: 3,
    description: 'An observance anyone can keep, any day.',
    defaults: { blocks: ['schedule', 'milestones', 'content'], schedule: { mode: 'always' }, milestones: { order: 'any', missed: 'catch_up_any', items: [] } },
  },
  {
    slug: 'japa', name: 'Japa', nameHi: 'जप', color: '#B5832A', gradient: ['#B5832A', '#E3C26B'], order: 4,
    description: 'A chanting goal with a running count.',
    defaults: { blocks: ['schedule', 'milestones', 'rewards'], schedule: { mode: 'always' }, milestones: { order: 'sequential', missed: 'catch_up_next', items: [] }, rewards: [] },
  },
];

/** Idempotent. Only into an empty EventType collection. */
export async function seedEvents() {
  if ((await EventType.estimatedDocumentCount()) > 0 || (await EventType.exists({}))) return { seeded: 0 };
  await EventType.insertMany(DEFAULT_EVENT_TYPES, { ordered: false }).catch((e) => { if (e?.code !== 11000 && !e?.writeErrors) throw e; });
  return { seeded: DEFAULT_EVENT_TYPES.length };
}
