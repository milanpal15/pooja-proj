import { normalizeStreamUrl, youTubeId } from '../../lib/stream-url.js';
import { Temple } from '../../models.js';
import { LiveCategory, LiveStream } from './live.model.js';

const CATEGORIES = [
  { slug: 'jyotirlinga', name: 'Jyotirlinga', nameHi: 'ज्योतिर्लिंग', order: 10 },
  { slug: 'shakti-peeth', name: 'Shakti Peeth', nameHi: 'शक्तिपीठ', order: 20 },
  { slug: 'ganga-aarti', name: 'Ganga Aarti', nameHi: 'गंगा आरती', order: 30 },
];

/** Categories once (only into an empty collection, so a deleted one stays deleted); temples' legacy `liveUrl` → streams. */
export async function seedLive() {
  if ((await LiveCategory.countDocuments()) === 0) await LiveCategory.insertMany(CATEGORIES);
  return migrateTempleStreams();
}

/** Idempotent: a temple that already has a stream is skipped. Returns how many were created. */
export async function migrateTempleStreams() {
  const temples = await Temple.find({ liveUrl: { $type: 'string', $ne: '' } }).lean();
  let created = 0;
  for (const t of temples) {
    const url = normalizeStreamUrl(t.liveUrl);
    if (!url) continue;
    if (await LiveStream.exists({ templeSlug: t.slug })) continue;
    try {
      await LiveStream.create({ slug: t.slug, templeSlug: t.slug, sourceType: youTubeId(url) ? 'youtube' : 'hls', url, enabled: true, order: t.order ?? 0 });
      created++;
    } catch (e) {
      if (e?.code !== 11000) throw e; // raced with another instance booting
    }
  }
  return created;
}
