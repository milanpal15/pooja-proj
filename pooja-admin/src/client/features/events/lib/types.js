/** Pure rules for event types (presets) and badges. Types never drive behaviour; they prefill the editor. */
import { BLOCK_IDS, ORDERS, REG_MODES, SCHEDULE_MODES, slugify } from './events.js';

export const blankType = () => ({ name: '', nameHi: '', color: '#af101a', description: '', enabled: true, blocks: ['schedule'], scheduleMode: 'single', regMode: 'none', order: 'any' });

/** An API type -> draft. Unknown `defaults` keys survive the round trip (see `typeBody`). */
export function typeDraft(ty = {}) {
  const d = ty.defaults || {};
  return {
    name: ty.name || '', nameHi: ty.nameHi || '', color: ty.color || '#af101a', description: ty.description || '', enabled: ty.enabled !== false,
    blocks: Array.isArray(d.blocks) ? d.blocks.filter((b) => BLOCK_IDS.includes(b)) : ['schedule'],
    scheduleMode: d.schedule?.mode || 'single', regMode: d.registration?.mode || 'none', order: d.milestones?.order || 'any',
  };
}

export function typeBody(draft, original = null, siblings = []) {
  const prev = original?.defaults || {};
  const has = (b) => draft.blocks.includes(b);
  const defaults = { ...prev, blocks: draft.blocks.slice() };
  if (has('schedule')) defaults.schedule = { ...(prev.schedule || {}), mode: draft.scheduleMode };
  if (has('registration')) defaults.registration = { ...(prev.registration || {}), mode: draft.regMode === 'none' ? 'free' : draft.regMode };
  if (has('milestones')) defaults.milestones = { ...(prev.milestones || {}), order: draft.order };
  return {
    ...(original ? {} : { slug: slugify(draft.name), order: Math.max(0, ...siblings.map((s) => s.order ?? 0)) + 10 }),
    name: draft.name.trim(), nameHi: draft.nameHi.trim(), color: draft.color, description: draft.description.trim(), enabled: draft.enabled, defaults,
  };
}

export function validateType(d, { taken = [] } = {}) {
  const e = {};
  if (!d.name.trim()) e.name = 'Add a name';
  else if (taken.includes(slugify(d.name))) e.name = 'A type with this name already exists';
  if (!/^#[0-9a-fA-F]{6}$/.test(d.color)) e.color = 'Use a hex colour like #af101a';
  return e;
}

export const blankBadge = () => ({ name: '', nameHi: '', description: '', art: '' });
export const badgeDraft = (b = {}) => ({ name: b.name || '', nameHi: b.nameHi || '', description: b.description || '', art: b.art || '' });
export function badgeBody(d, original = null) {
  return { ...(original ? {} : { slug: slugify(d.name) }), name: d.name.trim(), nameHi: d.nameHi.trim(), description: d.description.trim(), art: d.art };
}
export const validateBadge = (d) => (d.name.trim() ? {} : { name: 'Add a name' });

export const blocksSummary = (ty) => (ty?.defaults?.blocks || []).join(', ');
export { ORDERS, REG_MODES, SCHEDULE_MODES };
