import mongoose from 'mongoose';

/**
 * The ONE last location a devotee reported in an event (docs/EVENTS.md section 11), kept only so the next report can be checked for
 * a plausible speed. No trail: every report overwrites it. Never returned by any API. `reportedAt` is the 5-second report slot.
 * Deleted by MongoDB itself at `expiresAt` = the event's end + 7 days.
 */
const schema = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    eventSlug: { type: String, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    /** Server time of the report that stored lat/lng. */
    pointAt: { type: Date, default: null },
    reportedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false },
);
schema.index({ uid: 1, eventSlug: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LocationPoint = mongoose.models.LocationPoint || mongoose.model('LocationPoint', schema);
