import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * The daily aarti cycle the app can remind a devotee of.
 *
 * Was a literal in the app bundle, so a temple whose Mangala Aarti is at
 * 4:00 rather than 4:30 could not say so without a store release. The
 * devotee's own additions stay on their device — this is the temple's
 * suggested cycle, not their alarm list.
 */
const reminderSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: String,
    titleHi: String,
    body: String,
    bodyHi: String,
    hour: { type: Number, default: 6 }, // 24-hour
    minute: { type: Number, default: 0 },
    icon: { type: String, default: 'bell' }, // an IconName the app knows
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Reminder = model('Reminder', reminderSchema);
