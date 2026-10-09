import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A panchang override for one date.
 *
 * The app computes panchang on the device from the Sun and Moon, which is
 * correct astronomy and needs no backend. But panchang is not only
 * astronomy: it differs between the Smārta and Vaishnava traditions, between
 * amānta and pūrṇimānta month reckoning, and a temple may observe its own
 * sunrise rather than the computed one.
 *
 * So this is an override, not a source. **Every field is optional** — a row
 * fills in only what it sets and the device keeps computing the rest. A
 * temple that disagrees about the tithi alone sets the tithi alone.
 *
 * Times are plain strings (`6:12 AM`) rather than Dates: they are published
 * as a temple states them, and parsing them into instants would invent a
 * precision nobody intended.
 */
const panchangSchema = new Schema(
  {
    /** ISO `YYYY-MM-DD`, unique. */
    date: { type: String, required: true, unique: true, index: true },
    tithi: String,
    paksha: String,
    nakshatra: String,
    yoga: String,
    karana: String,
    masa: String,
    ritu: String,
    sunrise: String,
    sunset: String,
    rahuKaal: String,
    yamaganda: String,
    gulika: String,
    abhijit: String,
    /** Shown to the devotee so an override is never silently authoritative. */
    note: String,
    noteHi: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Panchang = model('Panchang', panchangSchema);
