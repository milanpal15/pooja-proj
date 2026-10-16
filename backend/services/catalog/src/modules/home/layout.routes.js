import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';

import { loadDefaultLayout } from './layout.default.js';
import { HomeLayoutDraft, HomeLayoutVersion } from './layout.model.js';
import { createVersion, ensureLayout, saveDraft } from './layout.store.js';
import { registryView } from './registry.js';
import { validateLayout } from './layout.validate.js';

const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const iso = (d) => (d ? new Date(d).toISOString() : null);

const summary = (v) => ({ version: v.version, publishedAt: iso(v.publishedAt), publishedBy: v.publishedBy ?? 'system', note: v.note ?? '', blockCount: v.blockCount ?? v.blocks?.length ?? 0 });
const draftView = (d) => ({ schemaVersion: d.schemaVersion ?? 1, blocks: d.blocks ?? [], updatedAt: iso(d.updatedAt), updatedBy: d.updatedBy ?? 'system' });
const operatorOf = (req) => req.operator?.username ?? 'unknown';

/** Throws `400 bad_layout` with the per-field messages, or returns the normalised document. */
function checked(body) {
  const { doc, fields } = validateLayout(body);
  if (!doc) throw new HttpError(400, 'bad_layout', 'The layout has errors.', { fields });
  return doc;
}

const dirtyOf = (draft, live) => canon({ schemaVersion: draft.schemaVersion ?? 1, blocks: draft.blocks ?? [] }) !== canon({ schemaVersion: live.schemaVersion ?? 1, blocks: live.blocks ?? [] });

/** Dashboard side of Home layout v2 (docs/HOME_LAYOUT.md section 4). Area `content`: editor writes, viewer reads. */
export function layoutRouters() {
  const admin = asyncRouter();
  admin.get('/admin/home-layout/registry', (_req, res) => res.json(registryView()));

  admin.get('/admin/home-layout', async (_req, res) => {
    const live = await ensureLayout();
    const draft = await HomeLayoutDraft.findOne({ key: 'main' }).lean();
    const history = await HomeLayoutVersion.find().select('-blocks').sort({ version: -1 }).limit(20).lean();
    res.json({ draft: draftView(draft), published: summary(live), history: history.map(summary), dirty: dirtyOf(draft, live) });
  });

  admin.put('/admin/home-layout/draft', async (req, res) => {
    const doc = checked(req.body);
    const live = await ensureLayout();
    const draft = await saveDraft(doc, operatorOf(req));
    res.json({ draft: draftView(draft), dirty: dirtyOf(draft, live) });
  });

  admin.post('/admin/home-layout/validate', (req, res) => {
    checked(req.body);
    res.json({ ok: true });
  });

  admin.post('/admin/home-layout/publish', async (req, res) => {
    const note = req.body?.note;
    if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw new HttpError(400, 'bad_note', 'note must be text of at most 300 characters.');
    await ensureLayout();
    const draft = await HomeLayoutDraft.findOne({ key: 'main' }).lean();
    const doc = checked({ schemaVersion: draft.schemaVersion, blocks: draft.blocks }); // re-validated: the registry may have moved on
    const version = await createVersion(doc, { by: operatorOf(req), note: (note ?? '').trim() });
    res.json({ version });
  });

  admin.post('/admin/home-layout/rollback', async (req, res) => {
    const n = req.body?.version;
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'bad_version', 'version must be a whole number.');
    const v = await HomeLayoutVersion.findOne({ version: n }).lean();
    if (!v) throw new HttpError(404, 'not_found', 'That version does not exist (it may have been trimmed).');
    const draft = await saveDraft({ schemaVersion: v.schemaVersion, blocks: v.blocks }, operatorOf(req));
    res.json({ draft: draftView(draft) });
  });

  admin.post('/admin/home-layout/reset-default', async (req, res) => {
    const draft = await saveDraft(await loadDefaultLayout(), operatorOf(req));
    res.json({ draft: draftView(draft) });
  });

  admin.get('/admin/home-layout/versions/:n', async (req, res) => {
    const n = Number(req.params.n);
    const v = Number.isInteger(n) && n >= 1 ? await HomeLayoutVersion.findOne({ version: n }).lean() : null;
    if (!v) throw new HttpError(404, 'not_found', 'That version does not exist (it may have been trimmed).');
    res.json({ ...summary(v), schemaVersion: v.schemaVersion ?? 1, blocks: v.blocks });
  });

  admin.use(httpErrorHandler);
  return { admin };
}
