import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Versions kept (oldest trimmed). docs/HOME_LAYOUT.md section 4. */
export const MAX_VERSIONS = 50;

/**
 * The operators' working copy: ONE document (`key: 'main'`). The layout SET (docs/HOME_LAYOUT.md section 9) is stored as
 * validated JSON (layout.validate.js is the schema), so Mongoose does not second-guess a shape the registry owns. `blocks` is
 * the v1 shape: read only by the upgrade (layout.upgrade.js / layout.store.js `migrateStoredLayouts`), never written.
 */
const draftSchema = new Schema(
  {
    key: { type: String, default: 'main', unique: true },
    schemaVersion: { type: Number, default: 2 },
    layouts: { type: [Schema.Types.Mixed], default: [] },
    blocks: { type: [Schema.Types.Mixed], default: undefined }, // legacy v1
    updatedBy: { type: String, default: 'system' },
  },
  { timestamps: true, minimize: false },
);

/** One published version: the FULL document, so a rollback never depends on anything else. The highest `version` is live. */
const versionSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    schemaVersion: { type: Number, default: 2 },
    layouts: { type: [Schema.Types.Mixed], default: [] },
    blocks: { type: [Schema.Types.Mixed], default: undefined }, // legacy v1
    publishedBy: { type: String, default: 'system' },
    note: { type: String, default: '' },
    blockCount: { type: Number, default: 0 }, // across all layouts
    layoutCount: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: 'publishedAt', updatedAt: false }, minimize: false },
);

export const HomeLayoutDraft = model('HomeLayoutDraft', draftSchema);
export const HomeLayoutVersion = model('HomeLayoutVersion', versionSchema);
