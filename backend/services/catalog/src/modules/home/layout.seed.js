import { HomeSection } from './home.model.js';
import { loadDefaultLayout } from './layout.default.js';
import { HomeLayoutDraft, HomeLayoutVersion } from './layout.model.js';
import { createVersion, saveDraft } from './layout.store.js';
import { ICONS, TONES } from './registry.js';
import { validateLayout } from './layout.validate.js';

const clip = (v, n = 160) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const idPart = (key) => String(key).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+/, '').slice(0, 36) || 'x';

/** An old free-text `href` -> an Action: "/x" is a route, https is a link, anything else (bhakti://, "") leads nowhere. */
function actionOf(href) {
  const h = typeof href === 'string' ? href.trim() : '';
  if (h.startsWith('/') && !h.startsWith('//')) return { type: 'route', ref: h };
  if (/^https:\/\//i.test(h)) return { type: 'link', ref: h };
  return null;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** One legacy HomeSection (custom / knowledge) as a `shelf` block; null when it has nothing to show. */
export function shelfFromSection(r) {
  const items = (r.items ?? []).slice(0, 24).map((i) => ({
    title: clip(i.title), titleHi: clip(i.titleHi), subtitle: clip(i.subtitle), subtitleHi: clip(i.subtitleHi),
    icon: ICONS.includes(i.icon) ? i.icon : '',
    image: /^\/uploads\/[\w.-]+$/.test(i.image ?? '') || /^https:\/\//.test(i.image ?? '') ? clip(i.image, 500) : '',
    badge: ['new', 'soon', 'special'].includes(i.badge) ? i.badge : '',
    liveBadge: false, flag: /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(i.flag ?? '') ? i.flag : '', deitySlug: clip(i.deitySlug, 80),
    action: actionOf(i.href),
  }));
  if (!items.length) return null;
  return {
    id: `m-${idPart(r.key)}`, type: 'shelf', enabled: true,
    startsAt: iso(r.startsAt), endsAt: iso(r.endsAt), language: 'all', flag: '',
    title: clip(r.title), titleHi: clip(r.titleHi), subtitle: '', subtitleHi: '',
    tone: TONES.includes(r.tone) ? r.tone : '',
    action: actionOf(r.footerHref), actionLabel: clip(r.footerLabel), actionLabelHi: clip(r.footerLabelHi),
    props: { layout: ['photo3', 'book2', 'list', 'grid4'].includes(r.layout) ? r.layout : 'photo3' },
    data: { mode: 'inline', items },
  };
}

/**
 * Version 1 of the Home layout, only while there is none: the built-in default, with every enabled `custom` / `knowledge`
 * HomeSection inserted as a shelf just before `listen` (or at the end). Idempotent: once a version exists nothing here
 * runs, so an operator's later edits and deletions are never undone. Also repairs a missing draft.
 *
 * Runs BEFORE the legacy HomeSection defaults are seeded, so a fresh database gets the pure default; an existing one
 * (rows present) gets its shelves carried over.
 */
export async function seedHomeLayout({ log = () => {} } = {}) {
  if (await HomeLayoutVersion.countDocuments()) {
    if (!(await HomeLayoutDraft.exists({ key: 'main' }))) {
      const last = await HomeLayoutVersion.findOne().sort({ version: -1 }).lean();
      await saveDraft(last, 'system');
    }
    return;
  }
  const doc = await loadDefaultLayout();
  const rows = await HomeSection.find({ enabled: { $ne: false }, source: { $in: ['custom', 'knowledge'] } }).sort({ order: 1, createdAt: 1 }).lean();
  const shelves = [];
  for (const r of rows) {
    const b = shelfFromSection(r);
    if (!b) continue;
    const ok = validateLayout({ schemaVersion: 1, blocks: [b] });
    if (ok.doc) shelves.push(ok.doc.blocks[0]);
    else log(`home layout: section "${r.key}" not migrated: ${JSON.stringify(ok.fields)}`);
  }
  if (shelves.length) {
    const at = doc.blocks.findIndex((b) => b.type === 'listen');
    doc.blocks.splice(at < 0 ? doc.blocks.length : at, 0, ...shelves.filter((s) => !doc.blocks.some((b) => b.id === s.id)));
  }
  await createVersion(doc, { note: shelves.length ? `Initial layout (migrated ${shelves.length} shelf blocks)` : 'Initial layout' });
  await saveDraft(doc, 'system');
}
