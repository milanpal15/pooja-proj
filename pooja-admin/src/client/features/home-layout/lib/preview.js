/**
 * The schematic phone preview as data: one model per block, drawn from the
 * JSON alone (it does not run the app), for the persona chosen in "Preview as".
 * How a block is DRAWN depends only on its data mode and its layout props
 * (plus one tiny `ART` table for the few bands the design paints specially):
 *
 *   data.mode 'source'            -> a band (tinted by tone) with the source named
 *   inline items + props.layout   -> that layout (photo3 / book2 / list / grid4)
 *   inline items + props.columns  -> an icon grid of that many columns
 *   inline items, nothing else    -> a horizontal row of cards
 *   no data                       -> a plain bar (a gap if props.height is set)
 *
 * Items switched off never draw; a badge past its `badgeUntil` is not drawn.
 */
import { badgeActive, matchesAudience, visibility } from './audience.js';

export { visibility, visibilityLabel } from './audience.js';

/** layout prop value -> how many tiles per row, and the tile shape. */
export const LAYOUTS = {
  photo3: { cols: 3, shape: 'photo' },
  book2: { cols: 2, shape: 'book' },
  list: { cols: 1, shape: 'row' },
  grid4: { cols: 4, shape: 'square' },
};

/** Presentation only: how the design paints a few types' bands on the phone. Anything else is a plain card. */
export const ART = {
  slider: 'banner', featured_pooja: 'banner', promo: 'banner', daily: 'dark', deity_row: 'chips', rashi_row: 'chips', header: 'topbar', search: 'search',
};

/** The text a block shows, in the preview language. */
export const pick = (en, hi, lang) => (lang === 'hi' && hi ? hi : en || hi || '');

export function itemModel(it, lang, now) {
  return {
    title: pick(it.title, it.titleHi, lang),
    subtitle: pick(it.subtitle, it.subtitleHi, lang),
    image: it.image || '',
    icon: it.icon || '',
    badge: badgeActive(it, now) ? it.badge : '',
    live: !!it.liveBadge,
    flag: it.flag || '',
  };
}

/**
 * @param {object} block
 * @param {object} reg      normalised registry
 * @param {{now?, lang?, persona?}} opts   lang: 'all' | 'en' | 'hi' (the language the preview pretends the phone is in); persona: { segments }
 */
export function previewModel(block, reg, { now = Date.now(), lang = 'en', persona = null } = {}) {
  const type = reg?.typeMap?.[block.type];
  const props = block.props || {};
  const known = reg?.audiences?.map((a) => a.key);
  const vis = visibility(block, { now, lang: lang === 'all' ? 'all' : lang, persona, known });
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
    art: ART[block.type] || '',
    icon: type?.icon || '',
    hasAction: !!(block.action && block.action.type && block.action.type !== 'none'),
    actionLabel: pick(block.actionLabel, block.actionLabelHi, lang),
    audienceMiss: !!persona && !matchesAudience(block.audience, persona, known),
  };
  const d = block.data;
  if (d && d.mode === 'source') {
    const src = reg?.sourceMap?.[d.source];
    return { ...base, kind: 'source', source: src?.title || d.source || 'no source chosen', sourceKey: d.source || '', auth: !!src?.auth, limit: d.limit || null, params: d.params || {} };
  }
  if (d && d.mode === 'inline') {
    const items = (d.items || []).filter((it) => it.enabled !== false).map((it) => itemModel(it, lang, now));
    const layout = LAYOUTS[props.layout];
    if (layout) return { ...base, kind: 'items', cols: layout.cols, shape: layout.shape, layout: props.layout, items };
    const cols = Number(props.columns);
    if (Number.isFinite(cols) && cols > 0) return { ...base, kind: 'items', cols, shape: 'tile', layout: 'columns', tileStyle: props.tileStyle || 'icon', items };
    return { ...base, kind: 'items', cols: 0, shape: 'card', layout: 'row', items };
  }
  const height = Number(props.height);
  if (Number.isFinite(height) && height > 0) return { ...base, kind: 'gap', height };
  const text = typeof props.placeholder === 'string' ? props.placeholder : typeof props.message === 'string' ? props.message : '';
  return { ...base, kind: 'plain', note: pick(text, props[`${text === props.message ? 'message' : 'placeholder'}Hi`], lang), icon: typeof props.icon === 'string' ? props.icon : base.icon };
}

/** The blocks the persona would actually be shown, plus `keepId` (the selected one, kept greyed so it can still be edited). */
export function shownBlocks(blocks, reg, opts, keepId) {
  return blocks.map((b) => previewModel(b, reg, opts)).filter((m) => !m.visibility || m.id === keepId);
}
