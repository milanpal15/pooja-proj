import { HomeSection } from './home.model.js';
import { loadDefaultLayout } from './layout.default.js';
import { HomeLayoutDraft, HomeLayoutVersion } from './layout.model.js';
import { asV2, createVersion, migrateStoredLayouts, saveDraft } from './layout.store.js';
import { ICONS, TONES } from './registry.js';
import { validateBlock } from './layout.validate.js';

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
 * Boot-time work: upgrade any stored v1 draft / versions to v2 (idempotent), then version 1 of the Home layout, only while there is none: the built-in default, with every enabled `custom` / `knowledge`
 * HomeSection inserted as a shelf just before `listen` (or at the end). Idempotent: once a version exists nothing here
 * runs, so an operator's later edits and deletions are never undone. Also repairs a missing draft.
 *
 * Runs BEFORE the legacy HomeSection defaults are seeded, so a fresh database gets the pure default; an existing one
 * (rows present) gets its shelves carried over.
 */
export async function seedHomeLayout({ log = () => {} } = {}) {
  const migrated = await migrateStoredLayouts();
  if (migrated) log(`home layout: upgraded ${migrated} stored v1 document(s) to v2`);
  if (await HomeLayoutVersion.countDocuments()) {
    if (!(await HomeLayoutDraft.exists({ key: 'main' }))) {
      const last = await HomeLayoutVersion.findOne().sort({ version: -1 }).lean();
      await saveDraft(asV2(last), 'system');
    }
    return;
  }
  const doc = await loadDefaultLayout();
  const rows = await HomeSection.find({ enabled: { $ne: false }, source: { $in: ['custom', 'knowledge'] } }).sort({ order: 1, createdAt: 1 }).lean();
  const shelves = [];
  for (const r of rows) {
    const b = shelfFromSection(r);
    if (!b) continue;
    const ok = validateBlock(b);
    if (ok.block) shelves.push(ok.block);
    else log(`home layout: section "${r.key}" not migrated: ${JSON.stringify(ok.fields)}`);
  }
  if (shelves.length) {
    const blocks = doc.layouts.find((l) => l.id === 'default').blocks;
    const at = blocks.findIndex((b) => b.type === 'listen');
    blocks.splice(at < 0 ? blocks.length : at, 0, ...shelves.filter((s) => !blocks.some((b) => b.id === s.id)));
  }
  await createVersion(doc, { note: shelves.length ? `Initial layout (migrated ${shelves.length} shelf blocks)` : 'Initial layout' });
  await saveDraft(doc, 'system');
}
