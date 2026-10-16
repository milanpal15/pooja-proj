/**
 * The schematic phone preview as data: one model per block, drawn from the
 * JSON alone (it does not run the app). How a block is DRAWN depends only on
 * its data mode and its layout props, never on its type's name:
 *
 *   data.mode 'source'            -> a hatched "live source: <name>" placeholder
 *   inline items + props.layout   -> that layout (photo3 / book2 / list / grid4)
 *   inline items + props.columns  -> an icon grid of that many columns
 *   inline items, nothing else    -> a horizontal row of cards
 *   no data                       -> a plain bar (a gap if props.height is set)
 */

/** layout prop value -> how many tiles per row, and the tile shape. */
export const LAYOUTS = {
  photo3: { cols: 3, shape: 'photo' },
  book2: { cols: 2, shape: 'book' },
  list: { cols: 1, shape: 'row' },
  grid4: { cols: 4, shape: 'square' },
};

/** Why a block is not shown: 'disabled' | 'scheduled' | 'ended' | 'language' | '' (shown). */
export function visibility(block, { now = Date.now(), lang = 'all' } = {}) {
  if (block.enabled === false) return 'disabled';
  const s = block.startsAt ? new Date(block.startsAt).getTime() : NaN;
  const e = block.endsAt ? new Date(block.endsAt).getTime() : NaN;
  if (!Number.isNaN(s) && s > now) return 'scheduled';
  if (!Number.isNaN(e) && e <= now) return 'ended';
  if (block.language && block.language !== 'all' && lang !== 'all' && block.language !== lang) return 'language';
  return '';
}

const VISIBILITY_LABEL = { disabled: 'Off', scheduled: 'Scheduled', ended: 'Ended', language: 'Other language' };
export const visibilityLabel = (v) => VISIBILITY_LABEL[v] || '';

/** The text a block shows, in the preview language. */
export const pick = (en, hi, lang) => (lang === 'hi' && hi ? hi : en || hi || '');

export function itemModel(it, lang) {
  return {
    title: pick(it.title, it.titleHi, lang),
    subtitle: pick(it.subtitle, it.subtitleHi, lang),
    image: it.image || '',
    icon: it.icon || '',
    badge: it.badge || '',
    live: !!it.liveBadge,
    flag: it.flag || '',
  };
}

/**
 * @param {object} block
 * @param {object} reg      normalised registry
 * @param {{now?, lang?}} opts   lang: 'all' | 'en' | 'hi' — the language the preview pretends the phone is in
 */
export function previewModel(block, reg, { now = Date.now(), lang = 'en' } = {}) {
  const type = reg?.typeMap?.[block.type];
  const props = block.props || {};
  const vis = visibility(block, { now, lang: lang === 'all' ? 'all' : lang });
  const base = {
    id: block.id,
    typeTitle: type?.title || block.type,
    unknownType: !type,
    title: pick(block.title, block.titleHi, lang),
    subtitle: pick(block.subtitle, block.subtitleHi, lang),
    tone: block.tone || '',
    visibility: vis,
    flag: block.flag || '',
    language: block.language || 'all',
    hasAction: !!(block.action && block.action.type && block.action.type !== 'none'),
    actionLabel: pick(block.actionLabel, block.actionLabelHi, lang),
  };
  const d = block.data;
  if (d && d.mode === 'source') {
    const src = reg?.sourceMap?.[d.source];
    return { ...base, kind: 'source', source: src?.title || d.source || 'no source chosen', sourceKey: d.source || '', auth: !!src?.auth, limit: d.limit || null, params: d.params || {} };
  }
  if (d && d.mode === 'inline') {
    const items = (d.items || []).map((it) => itemModel(it, lang));
    const layout = LAYOUTS[props.layout];
    if (layout) return { ...base, kind: 'items', cols: layout.cols, shape: layout.shape, layout: props.layout, items };
    const cols = Number(props.columns);
    if (Number.isFinite(cols) && cols > 0) return { ...base, kind: 'items', cols, shape: 'tile', layout: 'columns', items };
    return { ...base, kind: 'items', cols: 0, shape: 'card', layout: 'row', items };
  }
  const height = Number(props.height);
  if (Number.isFinite(height) && height > 0) return { ...base, kind: 'gap', height };
  const text = typeof props.placeholder === 'string' ? props.placeholder : typeof props.message === 'string' ? props.message : '';
  return { ...base, kind: 'plain', note: pick(text, props[`${text === props.message ? 'message' : 'placeholder'}Hi`], lang), icon: typeof props.icon === 'string' ? props.icon : '' };
}
