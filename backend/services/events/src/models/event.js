import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;
const block = { type: Mixed, default: undefined };

/**
 * The shape is enforced by events/validate.js (which hands this model an already-normalised object), so the block
 * bodies are Mixed. Absent blocks are simply not stored. Dates inside blocks are real Dates; presenters turn them into ISO.
 */
const schema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    schemaVersion: { type: Number, default: 1 },
    typeSlug: { type: String, required: true, index: true },
    tags: { type: [String], default: [] },
    title: { type: String, required: true, trim: true },
    titleHi: { type: String, default: '' },
    summary: { type: String, default: '' },
    summaryHi: { type: String, default: '' },
    cover: { type: String, default: '' },
    language: { type: String, enum: ['all', 'en', 'hi'], default: 'all' },
    theme: { type: Mixed, default: null },
    published: { type: Boolean, default: false, index: true },
    seriesId: { type: String, default: null },
    blocks: { type: [String], default: [] },
    schedule: block,
    registration: block,
    venue: block,
    milestones: block,
    rewards: block,
    content: block,
    route: block,
    /** schedule.startsAt, denormalised for sorting. */
    startsAt: { type: Date, default: null, index: true },
    /** Milestone keys that once existed and were removed: a key is never reused. */
    retiredKeys: { type: [String], default: [] },
  },
  { timestamps: true, minimize: false },
);

export const Event = mongoose.models.Event || mongoose.model('Event', schema);
