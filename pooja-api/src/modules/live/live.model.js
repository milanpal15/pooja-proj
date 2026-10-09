import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const aartiSchema = new Schema(
  {
    name: { type: String, required: true },
    nameHi: String,
    /** `HH:MM`, IST, 24 h. */
    time: { type: String, required: true },
    /** `'daily'` or a list of weekdays, 0 = Sunday. */
    days: { type: Schema.Types.Mixed, default: 'daily' },
  },
  { _id: false },
);

/** A temple's live darshan feed. See docs/LIVE_DARSHAN.md. */
const streamSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    templeSlug: { type: String, required: true, unique: true },
    categorySlug: { type: String, default: '' },
    sourceType: { type: String, enum: ['youtube', 'hls'], required: true },
    url: { type: String, required: true },
    cover: { type: String, default: '' },
    jaiText: { type: String, default: 'Jai' },
    jaiTextHi: { type: String, default: '' },
    aartis: { type: [aartiSchema], default: [] },
    chadhavaListingSlug: { type: String, default: '' },
    poojaSlug: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Cached probe result (probe.js). null = unknown, never "false by default".
    broadcasting: { type: Boolean, default: null },
    viewers: { type: Number, default: null },
    checkedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    probeNote: { type: String, default: '' },
  },
  { timestamps: true },
);

const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    nameHi: { type: String, default: '' },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** When a devotee last said Jai on a stream — one row per (uid, stream), so the 60 s throttle is atomic. */
const jaiLastSchema = new Schema({ uid: { type: String, required: true }, streamSlug: { type: String, required: true }, lastAt: { type: Date, required: true } });
jaiLastSchema.index({ uid: 1, streamSlug: 1 }, { unique: true });
jaiLastSchema.index({ lastAt: 1 }, { expireAfterSeconds: 86_400 });

/** Taps per (stream, aarti window); a new window is a new row, so the count resets each aarti. */
const jaiCountSchema = new Schema({ streamSlug: { type: String, required: true }, windowKey: { type: String, required: true }, count: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now } });
jaiCountSchema.index({ streamSlug: 1, windowKey: 1 }, { unique: true });
jaiCountSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 86_400 });

export const LiveStream = model('LiveStream', streamSchema);
export const LiveCategory = model('LiveCategory', categorySchema);
export const LiveJaiLast = model('LiveJaiLast', jaiLastSchema);
export const LiveJaiCount = model('LiveJaiCount', jaiCountSchema);
