import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Alert tones offered for those reminders.
 *
 * `sound` is either the name of a sound bundled with the app (`bell`,
 * `aarti`) or an absolute URL to an audio file. A URL plays fine through
 * the native alarm, which streams it; it cannot be used as an Android
 * notification-channel sound, so on the notification fallback path a URL
 * tone rings with the device default. Empty means silent.
 */
const toneSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: String,
    titleHi: String,
    desc: String,
    descHi: String,
    sound: String, // bundled name, absolute URL, or '' for silent
    icon: { type: String, default: 'bell' },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Tone = model('Tone', toneSchema);
