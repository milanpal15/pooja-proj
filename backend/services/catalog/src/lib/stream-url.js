/**
 * What an operator pastes into "Live darshan URL", turned into a plain https address.
 *
 * People paste three things: the address bar, YouTube's "Share → Embed" snippet (a whole
 * `<iframe … src="…">` tag), or a direct HLS/mp4 address. The first and last are URLs already; the
 * snippet is not, and used to be stored as-is. YouTube links are reduced to the canonical watch
 * address (dropping `?si=` tracking and friends) so what the dashboard shows is a link, not markup.
 * Mirrored by `poojaappclone/src/features/darshan/lib/stream-url.ts`, which also understands the
 * snippet, so an older row never breaks the player — keep the two in step.
 */
const ID = '([A-Za-z0-9_-]{11})';

const YOUTUBE_PATTERNS = [
  new RegExp(`[?&]v=${ID}`),
  new RegExp(`youtu\\.be/${ID}`),
  new RegExp(`youtube(?:-nocookie)?\\.com/(?:live|embed|shorts|v)/${ID}`),
];

export function youTubeId(text) {
  for (const re of YOUTUBE_PATTERNS) {
    const m = String(text).match(re);
    if (m) return m[1];
  }
  return null;
}

/** The `src` of an `<iframe>` snippet, with HTML entities undone; the text itself otherwise. */
export function unwrapEmbed(raw) {
  const text = String(raw ?? '').trim();
  if (!/<iframe/i.test(text)) return text;
  const m = text.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&').trim();
}

/** `''` for blank; the cleaned https URL; or `null` when it is not something a player can open. */
export function normalizeStreamUrl(raw) {
  const text = unwrapEmbed(raw);
  if (!text) return '';
  const id = /youtube|youtu\.be/i.test(text) ? youTubeId(text) : null;
  if (id) return `https://www.youtube.com/watch?v=${id}`;
  try {
    const u = new URL(text);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
