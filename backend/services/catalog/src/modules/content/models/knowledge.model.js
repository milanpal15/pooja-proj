import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Deity lore for the Knowledge screen.
 *
 * Mirrors the bundled `LORE` shape exactly — epithet, prose, a fact table,
 * scriptures and festivals — so the dashboard edits the structure the screen
 * already renders rather than a lossy approximation of it.
 */
const knowledgeSchema = new Schema(
  {
    deitySlug: { type: String, required: true, unique: true, index: true },
    epithet: String,
    epithetHi: String,
    about: String,
    aboutHi: String,
    /** Key/value rows: Abode, Vahana, Consort… */
    facts: { type: [{ k: String, kHi: String, v: String, vHi: String }], default: [] },
    texts: { type: [String], default: [] },
    textsHi: { type: [String], default: [] },
    festivals: { type: [String], default: [] },
    festivalsHi: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Knowledge = model('Knowledge', knowledgeSchema);
