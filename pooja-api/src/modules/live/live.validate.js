import { HttpError } from '../../lib/http-error.js';
import { normalizeStreamUrl, youTubeId } from '../../lib/stream-url.js';
import { Temple } from '../../models.js';
import { LiveCategory, LiveStream } from './live.model.js';
import { toMinutes } from './live.state.js';

const bad = (message, code = 'bad_stream') => new HttpError(400, code, message);
const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const text = (v, field, max) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw bad(`${field} must be text.`);
  const t = v.trim();
  if (t.length > max) throw bad(`${field} must be at most ${max} characters.`);
  return t;
};

function cleanAartis(list) {
  if (!Array.isArray(list)) throw bad('aartis must be a list.');
  if (list.length > 12) throw bad('A stream can have at most 12 aartis.');
  return list.map((a) => {
    if (!a || typeof a !== 'object') throw bad('Each aarti must be an object.');
    const name = text(a.name, 'Aarti name', 60);
    if (!name) throw bad('Each aarti needs a name.');
    if (toMinutes(a.time) === null) throw bad('Aarti time must be HH:MM (24 hour, IST).');
    let days = a.days ?? 'daily';
    if (days !== 'daily') {
      if (!Array.isArray(days) || !days.length || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) throw bad('Aarti days must be "daily" or a list of weekdays 0-6 (0 = Sunday).');
      days = [...new Set(days)].sort();
    }
    return { name, nameHi: text(a.nameHi, 'Aarti name (Hindi)', 60), time: a.time, days };
  });
}

/** The link in the form its source type can play, or `bad_stream_url`. */
export function cleanSourceUrl(sourceType, raw) {
  const url = normalizeStreamUrl(raw);
  const refuse = () => new HttpError(400, 'bad_stream_url', 'That is not a link a player can open.');
  if (!url) throw refuse();
  if (sourceType === 'youtube') {
    if (!youTubeId(url)) throw new HttpError(400, 'bad_stream_url', 'That is not a YouTube link.');
    return url;
  }
  if (sourceType === 'hls') {
    const path = new URL(url).pathname;
    if (!/\.(m3u8|mp4)$/i.test(path)) throw new HttpError(400, 'bad_stream_url', 'A direct stream must be an https .m3u8 or .mp4 link.');
    return url;
  }
  throw bad('sourceType must be youtube or hls.');
}

/** `prepare(body, existing)` for the stream CRUD. A partial PUT is validated as the merged row. */
export async function prepareStream(body, existing) {
  const b = body && typeof body === 'object' ? body : {};
  const m = (k) => (b[k] !== undefined ? b[k] : existing?.[k]);

  const templeSlug = text(m('templeSlug'), 'templeSlug', 80);
  if (!templeSlug) throw bad('Choose a temple.');
  if (existing && templeSlug !== existing.templeSlug) throw bad('A stream cannot be moved to another temple.');
  if (!(await Temple.exists({ slug: templeSlug }))) throw bad('That temple does not exist.', 'bad_temple');
  const clash = await LiveStream.exists({ templeSlug, ...(existing ? { _id: { $ne: existing._id } } : {}) });
  if (clash) throw new HttpError(409, 'duplicate_temple', 'That temple already has a stream.');

  const sourceType = m('sourceType');
  const url = cleanSourceUrl(sourceType, m('url'));

  const categorySlug = text(m('categorySlug'), 'categorySlug', 80);
  if (categorySlug && !(await LiveCategory.exists({ slug: categorySlug }))) throw bad('That category does not exist.', 'bad_category');

  const order = m('order') === undefined || m('order') === '' ? 0 : Number(m('order'));
  if (!Number.isFinite(order)) throw bad('order must be a number.');
  if (m('enabled') !== undefined && typeof m('enabled') !== 'boolean') throw bad('enabled must be true or false.');

  const out = {
    slug: templeSlug,
    templeSlug,
    categorySlug,
    sourceType,
    url,
    cover: text(m('cover'), 'cover', 300),
    jaiText: text(m('jaiText'), 'jaiText', 40) || 'Jai',
    jaiTextHi: text(m('jaiTextHi'), 'jaiTextHi', 40),
    aartis: cleanAartis(m('aartis') ?? []),
    chadhavaListingSlug: text(m('chadhavaListingSlug'), 'chadhavaListingSlug', 80),
    poojaSlug: text(m('poojaSlug'), 'poojaSlug', 80),
    enabled: m('enabled') ?? true,
    order,
  };
  // A different link means the cached probe no longer describes it.
  if (!existing || existing.url !== url || existing.sourceType !== sourceType) {
    Object.assign(out, { broadcasting: null, viewers: null, checkedAt: null, startedAt: null, probeNote: '' });
  }
  return out;
}

export async function prepareCategory(body, existing) {
  const b = body && typeof body === 'object' ? body : {};
  const m = (k) => (b[k] !== undefined ? b[k] : existing?.[k]);
  const name = text(m('name'), 'name', 60);
  if (!name) throw bad('A category needs a name.', 'bad_category');
  const slug = text(m('slug'), 'slug', 80) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!SLUG.test(slug)) throw bad('Slug must be lowercase letters, digits, - or _.', 'bad_category');
  const order = m('order') === undefined || m('order') === '' ? 0 : Number(m('order'));
  if (!Number.isFinite(order)) throw bad('order must be a number.', 'bad_category');
  if (m('enabled') !== undefined && typeof m('enabled') !== 'boolean') throw bad('enabled must be true or false.', 'bad_category');
  return { slug, name, nameHi: text(m('nameHi'), 'nameHi', 60), order, enabled: m('enabled') ?? true };
}
