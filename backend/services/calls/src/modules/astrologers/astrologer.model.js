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
    /**
     * True while this astrologer has a phone registered for push (identity's registry): they can be rung with the app closed, so a stale heartbeat does
     * not make them uncallable (see `effectivePresence`). Refreshed when they go Online and on every heartbeat; kept as-is when identity cannot answer.
     */
    pushReachable: { type: Boolean, default: false },
    lastSignInAt: Date,
    /** A short lease taken while a payout is recorded, so two payouts (even from two instances) cannot both fit under one `due` (payout.service). */
    payoutLock: { id: String, until: Date },
  },
  { timestamps: true },
);
astrologerSchema.index({ signInEmail: 1 }, { unique: true, sparse: true });
astrologerSchema.index({ signInPhone: 1 }, { unique: true, sparse: true });
astrologerSchema.index({ uid: 1 }, { unique: true, sparse: true });

export const Astrologer = model('Astrologer', astrologerSchema);

/** Heartbeats older than this mean "gone", whatever `presence` still says - unless the astrologer is push-reachable (below). */
export const PRESENCE_FRESH_MS = 45_000;

/**
 * How long an astrologer who is Online AND has a push-registered phone stays callable after their app last checked in. The app only heartbeats
 * while it is open, but the phone is woken by the notification, so the 45 s rule cannot be the rule for them. Bounded, so a phone that died or lost
 * its network is not listed as available all day; opening the app refreshes it.
 */
export const PUSH_REACHABLE_MS = 4 * 60 * 60 * 1000;

/** The ONE presence rule (public list, the call-request check, the astrologer's own view). Busy stays busy; a deliberate Offline always wins. */
export function effectivePresence(a, now = Date.now()) {
  if (a.presence === 'busy') return 'busy';
  if (a.presence === 'online' && a.lastSeenAt) {
    const age = now - new Date(a.lastSeenAt).getTime();
    if (age < PRESENCE_FRESH_MS) return 'online';
    if (a.pushReachable && age < PUSH_REACHABLE_MS) return 'online';
  }
  return 'offline';
}
