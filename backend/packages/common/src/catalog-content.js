/**
 * `GET /api/content`, assembled at the edge (phase 3). The monolith used to build it in modules/public/public.routes.js from its own
 * collections + the engagement client; the catalog service now returns everything it owns (`/public/content`) and the BFF adds the two
 * pieces that are engagement's: `settings` (flat key/value map) and `announcement` (the newest live modal announcement).
 *
 * The body is byte-identical to the monolith's, KEY ORDER included:
 *   deities, temples, aartis, festivals, sevas, knowledge, faqs, hero, home, reminders, tones, wallpaperStyles, settings, announcement
 */

/** What `settings` is when engagement has never answered (same literals as pooja-api/src/lib/engagement-client.js FALLBACK_SETTINGS). */
export const FALLBACK_SETTINGS = Object.freeze({
  prasadDelivery: '99',
  supportEmail: '',
  supportPhone: '',
  supportHours: '',
  supportHoursHi: '',
});

export const CONTENT_KEYS = ['deities', 'temples', 'aartis', 'festivals', 'sevas', 'knowledge', 'faqs', 'hero', 'home', 'reminders', 'tones', 'wallpaperStyles'];

export function assembleContent(bundle, settings, announcement) {
  const out = {};
  for (const k of CONTENT_KEYS) out[k] = bundle[k];
  out.settings = settings;
  out.announcement = announcement;
  return out;
}

export const READER_TTL_MS = 15_000;
export const READER_RETRY_AFTER_FAIL_MS = 5_000;

/**
 * Cached engagement reads for the content body: 15 s TTL, the last good answer (any age) when engagement is down, then the
 * documented defaults - the same rules as the monolith's engagement client, so an outage never fails the whole content fetch.
 */
export function createEngagementReaders(client, { logger } = {}) {
  const state = new Map();
  async function cachedRead(name, path, pick, fallback) {
    const s = state.get(name) ?? {};
    state.set(name, s);
    const now = Date.now();
    if (s.value !== undefined && now - s.at < READER_TTL_MS) return s.value;
    if (s.failedAt && now - s.failedAt < READER_RETRY_AFTER_FAIL_MS) return s.value ?? fallback;
    s.inflight ??= client
      .get(path, { timeoutMs: 2500 })
      .then((d) => {
        s.value = pick(d);
        s.at = Date.now();
        s.failedAt = 0;
      })
      .catch((e) => {
        s.failedAt = Date.now();
        logger?.warn(`engagement unreachable for content (${e?.code || e?.message}): serving cached/default ${name}`);
      })
      .finally(() => {
        s.inflight = null;
      });
    await s.inflight;
    return s.value ?? fallback;
  }
  return {
    settings: () => cachedRead('settings', '/internal/engagement/settings/map', (d) => (d && typeof d.settings === 'object' && d.settings) || {}, { ...FALLBACK_SETTINGS }),
    announcement: () => cachedRead('announcement', '/internal/engagement/announcements/current', (d) => d?.announcement ?? null, null),
  };
}
