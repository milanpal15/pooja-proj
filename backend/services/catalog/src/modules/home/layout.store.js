import { HttpError } from '../../lib/http-error.js';
import { HomeLayoutDraft, HomeLayoutVersion, MAX_VERSIONS } from './layout.model.js';
import { loadDefaultLayout } from './layout.default.js';

export const latestVersion = () => HomeLayoutVersion.findOne().sort({ version: -1 }).lean();

const isDup = (e) => e?.code === 11000;

/** Create version `n` (n = latest + 1) from a validated document, then trim history. A concurrent publish gets 409. */
export async function createVersion(doc, { by = 'system', note = '' } = {}) {
  const last = await latestVersion();
  const version = (last?.version ?? 0) + 1;
  try {
    await HomeLayoutVersion.create({ version, schemaVersion: doc.schemaVersion, blocks: doc.blocks, publishedBy: by, note, blockCount: doc.blocks.length });
  } catch (e) {
    if (isDup(e)) throw new HttpError(409, 'publish_conflict', 'Someone else published at the same moment. Try again.');
    throw e;
  }
  await HomeLayoutVersion.deleteMany({ version: { $lte: version - MAX_VERSIONS } });
  return version;
}

export async function saveDraft(doc, by) {
  return HomeLayoutDraft.findOneAndUpdate(
    { key: 'main' },
    { $set: { schemaVersion: doc.schemaVersion, blocks: doc.blocks, updatedBy: by } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

/**
 * There is ALWAYS a published layout: if the collection is somehow empty (seed not run yet, or someone dropped it) the
 * default becomes version 1, and a missing draft is recreated from the live version.
 */
export async function ensureLayout() {
  let live = await latestVersion();
  if (!live) {
    const doc = await loadDefaultLayout();
    try { await createVersion(doc, { note: 'Initial layout' }); } catch (e) { if (e.code !== 'publish_conflict') throw e; }
    live = await latestVersion();
  }
  if (!(await HomeLayoutDraft.exists({ key: 'main' }))) {
    try { await saveDraft(live, 'system'); } catch (e) { if (!isDup(e)) throw e; }
  }
  return live;
}
