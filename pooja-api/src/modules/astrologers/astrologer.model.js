import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * An astrologer an operator added in the dashboard (DESIGN.md §19.6a).
 *
 * Nobody becomes one by asking: the operator types the e-mail or mobile number
 * the person will sign in with, and the first verified sign-in with it claims
 * the row (`claim.js`) and stamps `uid`. That identifier is the key — there is
 * no password and no invite e-mail.
 *
 * `signInEmail` / `signInPhone` are SPARSE-unique: leave a field unset (never
 * null/'') when it is not used, or two rows without a phone would collide.
 * `presence` is soft state — a stale `lastSeenAt` means offline, whatever it says.
 * Rating is deliberately not stored here: it is derived from real call ratings.
 */
const astrologerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    bio: { type: String, default: '' },
    photoUrl: { type: String, default: '' },
    specialities: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    yearsExperience: { type: Number, default: 0, min: 0 },
    /** Coins per started minute. Snapshotted onto each call. */
    ratePerMin: { type: Number, required: true, min: 1 },
    /** Platform's cut, percent. Snapshotted onto each call. */
    platformSharePct: { type: Number, default: 30, min: 0, max: 100 },
    signInEmail: { type: String, lowercase: true, trim: true },
    signInPhone: { type: String, trim: true },
    /** Firebase uid, set by the first verified sign-in. */
    uid: { type: String },
    status: { type: String, enum: ['invited', 'active', 'suspended'], default: 'invited', index: true },
    listed: { type: Boolean, default: true },
    presence: { type: String, enum: ['offline', 'online', 'busy'], default: 'offline' },
    lastSeenAt: Date,
    lastSignInAt: Date,
  },
  { timestamps: true },
);
astrologerSchema.index({ signInEmail: 1 }, { unique: true, sparse: true });
astrologerSchema.index({ signInPhone: 1 }, { unique: true, sparse: true });
astrologerSchema.index({ uid: 1 }, { unique: true, sparse: true });

export const Astrologer = model('Astrologer', astrologerSchema);

/** Heartbeats older than this mean "gone", whatever `presence` still says. */
export const PRESENCE_FRESH_MS = 45_000;

export function effectivePresence(a, now = Date.now()) {
  if (a.presence === 'busy') return 'busy';
  if (a.presence === 'online' && a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() < PRESENCE_FRESH_MS) return 'online';
  return 'offline';
}
