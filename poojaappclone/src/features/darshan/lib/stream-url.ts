/**
 * The live-darshan address, read the way operators actually paste it.
 *
 * The API cleans a pasted YouTube embed snippet into a plain link when it is saved
 * (`pooja-api/src/lib/stream-url.js` — keep the two in step), but a row saved before that, or by
 * any other route, can still hold the whole `<iframe …>` tag. The player must not care, so it is
 * understood here too.
 */
const ID = '([A-Za-z0-9_-]{11})';

const YOUTUBE_PATTERNS = [
  new RegExp(`[?&]v=${ID}`),
  new RegExp(`youtu\\.be/${ID}`),
  new RegExp(`youtube(?:-nocookie)?\\.com/(?:live|embed|shorts|v)/${ID}`),
];

/** The YouTube video id inside a link or an embed snippet, or null. */
export function youTubeId(text: string): string | null {
  for (const re of YOUTUBE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

/** The `src` of an `<iframe>` snippet (entities undone); any other text unchanged. */
export function unwrapEmbed(raw: string): string {
  const text = raw.trim();
  if (!/<iframe/i.test(text)) return text;
  const m = text.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&').trim();
}

/** The address to hand the player: embed snippets unwrapped, blank → undefined. */
export function streamAddress(raw: string | undefined | null): string | undefined {
  const text = unwrapEmbed(raw ?? '');
  return text || undefined;
}
