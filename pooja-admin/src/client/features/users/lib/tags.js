/** Tags are lowercase slugs: at most 24 characters, at most 10 per user (docs/USERS.md §1). */
export const TAG_MAX = 24;
export const TAGS_PER_USER = 10;

export function normaliseTag(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .slice(0, TAG_MAX)
    .replace(/-$/, '');
  return s;
}

/** "VIP, beta tester, vip" -> ['vip', 'beta-tester']. A comma or a new line separates tags, so a tag may hold words. */
export function parseTags(text) {
  const seen = new Set();
  for (const part of String(text ?? '').split(/[,\n]+/)) {
    const t = normaliseTag(part);
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * What to send for "add these tags to a user who has `current`": only tags they do not have, and an error
 * when the user would end up over the limit.
 * @returns {{ add: string[], error: string }}
 */
export function planAdd(current = [], wanted = []) {
  const have = new Set(current);
  const add = wanted.filter((t) => !have.has(t));
  if (have.size + add.length > TAGS_PER_USER) {
    return { add: [], error: `A user can have at most ${TAGS_PER_USER} tags (they have ${have.size}).` };
  }
  return { add, error: '' };
}
