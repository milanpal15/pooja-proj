import { HttpError } from '../../lib/http-error.js';
import { HomeLayoutDraft, HomeLayoutVersion, MAX_VERSIONS } from './layout.model.js';
import { loadDefaultLayout } from './layout.default.js';
import { countBlocks, isV2, upgradeDocument } from './layout.upgrade.js';

/**
 * A stored row as a v2 document: `{...row, schemaVersion: 2, layouts}`, never `blocks`. A v1 row is upgraded IN MEMORY
 * here, so every reader sees v2 whether or not `migrateStoredLayouts` has persisted it yet.
 */
export function asV2(row) {
  if (!row) return row;
  const { blocks: _legacy, ...rest } = row;
  const doc = upgradeDocument(isV2(row) ? row : { schemaVersion: row.schemaVersion, blocks: row.blocks });
  return { ...rest, schemaVersion: doc.schemaVersion, layouts: doc.layouts };
}

export const latestVersion = async () => asV2(await HomeLayoutVersion.findOne().sort({ version: -1 }).lean());
export const findVersion = async (n) => asV2(await HomeLayoutVersion.findOne({ version: n }).lean());
export const loadDraft = async () => asV2(await HomeLayoutDraft.findOne({ key: 'main' }).lean());

const isDup = (e) => e?.code === 11000;

/** Create version `n` (n = latest + 1) from a validated document, then trim history. A concurrent publish gets 409. */
export async function createVersion(doc, { by = 'system', note = '' } = {}) {
  const last = await HomeLayoutVersion.findOne().sort({ version: -1 }).select('version').lean();
  const version = (last?.version ?? 0) + 1;
  try {
    await HomeLayoutVersion.create({
      version, schemaVersion: doc.schemaVersion, layouts: doc.layouts, publishedBy: by, note, blockCount: countBlocks(doc), layoutCount: doc.layouts.length,
    });
  } catch (e) {
    if (isDup(e)) throw new HttpError(409, 'publish_conflict', 'Someone else published at the same moment. Try again.');
    throw e;
  }
  await HomeLayoutVersion.deleteMany({ version: { $lte: version - MAX_VERSIONS } });
  return version;
}

export async function saveDraft(doc, by) {
  const row = await HomeLayoutDraft.findOneAndUpdate(
    { key: 'main' },
    { $set: { schemaVersion: doc.schemaVersion, layouts: doc.layouts, updatedBy: by }, $unset: { blocks: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return asV2(row);
}

/**
 * Persist the v1 -> v2 upgrade of the draft and of every stored version (idempotent: a row that already has `layouts` is
 * left alone). Uses the driver directly, so the legacy `blocks` field is really removed. Returns how many rows changed.
 */
export async function migrateStoredLayouts() {
  let changed = 0;
  for (const Model of [HomeLayoutDraft, HomeLayoutVersion]) {
    const rows = await Model.collection.find({ layouts: { $exists: false } }).toArray();
    for (const row of rows) {
      const doc = upgradeDocument({ schemaVersion: row.schemaVersion, blocks: row.blocks });
      const $set = { schemaVersion: doc.schemaVersion, layouts: doc.layouts };
      if (Model === HomeLayoutVersion) { $set.blockCount = countBlocks(doc); $set.layoutCount = doc.layouts.length; }
      await Model.collection.updateOne({ _id: row._id }, { $set, $unset: { blocks: '' } });
      changed += 1;
    }
  }
  return changed;
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
