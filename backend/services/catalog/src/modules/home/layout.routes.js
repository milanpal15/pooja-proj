import { asyncRouter } from '../../lib/async-handler.js';
import { HttpError, httpErrorHandler } from '../../lib/http-error.js';

import { loadDefaultLayout } from './layout.default.js';
import { HomeLayoutVersion } from './layout.model.js';
import { countChanges } from './layout.diff.js';
import { createVersion, ensureLayout, findVersion, loadDraft, saveDraft } from './layout.store.js';
import { countBlocks } from './layout.upgrade.js';
import { registryView } from './registry.js';
import { validateLayout } from './layout.validate.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const summary = (v) => ({
  version: v.version, publishedAt: iso(v.publishedAt), publishedBy: v.publishedBy ?? 'system', note: v.note ?? '',
  blockCount: v.blockCount ?? 0, layoutCount: v.layoutCount ?? 1,
});
const draftView = (d) => ({ schemaVersion: d.schemaVersion ?? 2, layouts: d.layouts ?? [], updatedAt: iso(d.updatedAt), updatedBy: d.updatedBy ?? 'system' });
const operatorOf = (req) => req.operator?.username ?? 'unknown';

/** Throws `400 bad_layout` with the per-field messages, or returns the normalised document. */
function checked(body) {
  const { doc, fields } = validateLayout(body);
  if (!doc) throw new HttpError(400, 'bad_layout', 'The layout has errors.', { fields });
  return doc;
}

const status = (draft, live) => { const changes = countChanges(draft, live); return { changes, dirty: changes > 0 }; };

/** Dashboard side of Home layout v2.1 (docs/HOME_LAYOUT.md sections 4 and 9). Area `content`: editor writes, viewer reads. */
export function layoutRouters() {
  const admin = asyncRouter();
  admin.get('/admin/home-layout/registry', (_req, res) => res.json(registryView()));

  admin.get('/admin/home-layout', async (_req, res) => {
    const live = await ensureLayout();
    const draft = await loadDraft();
    const history = await HomeLayoutVersion.find().select('-layouts -blocks').sort({ version: -1 }).limit(20).lean();
    res.json({ draft: draftView(draft), published: { ...summary(live), blockCount: countBlocks(live), layoutCount: live.layouts.length }, history: history.map(summary), ...status(draft, live) });
  });

  admin.put('/admin/home-layout/draft', async (req, res) => {
    const doc = checked(req.body);
    const live = await ensureLayout();
    const draft = await saveDraft(doc, operatorOf(req));
    res.json({ draft: draftView(draft), ...status(draft, live) });
  });

  admin.post('/admin/home-layout/validate', (req, res) => {
    checked(req.body);
    res.json({ ok: true });
  });

  admin.post('/admin/home-layout/publish', async (req, res) => {
    const note = req.body?.note;
    if (note !== undefined && (typeof note !== 'string' || note.length > 300)) throw new HttpError(400, 'bad_note', 'note must be text of at most 300 characters.');
    await ensureLayout();
    const draft = await loadDraft();
    const doc = checked({ schemaVersion: draft.schemaVersion, layouts: draft.layouts }); // re-validated: the registry may have moved on
    const version = await createVersion(doc, { by: operatorOf(req), note: (note ?? '').trim() });
    res.json({ version });
  });

  admin.post('/admin/home-layout/rollback', async (req, res) => {
    const n = req.body?.version;
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'bad_version', 'version must be a whole number.');
    const v = await findVersion(n);
    if (!v) throw new HttpError(404, 'not_found', 'That version does not exist (it may have been trimmed).');
    const draft = await saveDraft({ schemaVersion: v.schemaVersion, layouts: v.layouts }, operatorOf(req));
    res.json({ draft: draftView(draft) });
  });

  admin.post('/admin/home-layout/discard', async (req, res) => {
    const live = await ensureLayout();
    const draft = await saveDraft({ schemaVersion: live.schemaVersion, layouts: live.layouts }, operatorOf(req));
    res.json({ draft: draftView(draft) });
  });

  admin.post('/admin/home-layout/reset-default', async (req, res) => {
    const draft = await saveDraft(await loadDefaultLayout(), operatorOf(req));
    res.json({ draft: draftView(draft) });
  });

  admin.get('/admin/home-layout/versions/:n', async (req, res) => {
    const n = Number(req.params.n);
    const v = Number.isInteger(n) && n >= 1 ? await findVersion(n) : null;
    if (!v) throw new HttpError(404, 'not_found', 'That version does not exist (it may have been trimmed).');
    res.json({ ...summary(v), blockCount: countBlocks(v), layoutCount: v.layouts.length, schemaVersion: v.schemaVersion ?? 2, layouts: v.layouts });
  });

  admin.use(httpErrorHandler);
  return { admin };
}
