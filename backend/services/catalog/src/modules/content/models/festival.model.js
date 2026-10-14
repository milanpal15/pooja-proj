import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A vrat or festival date shown on Home and the festivals screen.
 *
 * Lives in the database rather than in the app bundle because the Hindu
 * calendar is lunar: the dates move every year and cannot be derived from a
 * Gregorian rule. Hardcoding them means the list silently runs dry and the
 * Home section renders empty — which is exactly what happened. Editing them
 * here fixes every installed app without a release.
 */
const festivalSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String,
    nameHi: String,
    /** ISO `YYYY-MM-DD`. Compared as a string against the device's local day. */
    date: { type: String, index: true },
    /** Links to a deity slug so the card can open that aarti. */
    deitySlug: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Festival = model('Festival', festivalSchema);
