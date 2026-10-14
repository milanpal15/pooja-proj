import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One rashi's reading for one day.
 *
 * Editorial, not computed — a prediction is somebody's words, and the app
 * must never invent them. No row for today means the screen says nothing is
 * published rather than filling the space.
 *
 * `rashi` is the English slug (`mesha`, `vrishabha`, …) and `date` is ISO
 * `YYYY-MM-DD`; together they are unique, so publishing twice for the same
 * sign and day updates rather than duplicates.
 */
const horoscopeSchema = new Schema(
  {
    rashi: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true },
    prediction: String,
    predictionHi: String,
    /** Optional colour/number/time, shown only when filled in. */
    luckyColor: String,
    luckyColorHi: String,
    luckyNumber: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);
horoscopeSchema.index({ rashi: 1, date: 1 }, { unique: true });

export const Horoscope = model('Horoscope', horoscopeSchema);
