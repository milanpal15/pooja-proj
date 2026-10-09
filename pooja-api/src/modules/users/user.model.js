import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * An app user account, owned by Firebase Authentication.
 *
 * `uid` is the real identity — it comes from a verified Firebase ID token and
 * is the only field a client cannot lie about. `contact` (phone number or
 * email) is kept as the human-readable handle the dashboard sorts and
 * searches by, and it is still unique, but it is derived from the token
 * rather than supplied by the app.
 *
 * `uid` is sparse so the rows created before Firebase (which have a contact
 * but no uid) do not all collide on `null`; the sync route adopts such a row
 * the first time its owner signs in for real.
 */
const userSchema = new Schema(
  {
    uid: { type: String, unique: true, sparse: true, index: true },
    contact: { type: String, required: true, unique: true, index: true },
    name: String,
    method: String, // phone | google
    /**
     * Verified from the token where the provider supplies one — Google
     * does, phone sign-in does not. A phone devotee may give an email on
     * the profile screen, and that one is self-declared, not verified.
     */
    email: String,
    /** True only when the email came from the identity token. */
    emailVerified: { type: Boolean, default: false },
    phone: String,
    photoUrl: String,
    bio: String,
    /** Self-declared. `prefer_not_to_say` is a real answer, not a blank. */
    gender: { type: String, enum: ['female', 'male', 'other', 'prefer_not_to_say'] },
    /** Date of birth as YYYY-MM-DD — a calendar date, never a timestamp. */
    dob: String,
    deviceId: String,
    blocked: { type: Boolean, default: false },
    /**
     * Which app shell this account gets. Set ONLY by the sign-in claim and by
     * the astrologer lifecycle (modules/astrologers) — never from a request
     * body. It is a convenience copy: the astrologer endpoints re-check the
     * Astrologer row, so a stale value cannot grant anything.
     */
    role: { type: String, enum: ['devotee', 'astrologer'], default: 'devotee' },
    /**
     * Temple slugs this devotee bookmarked.
     *
     * On the user rather than its own collection: it is a short list, only
     * ever read and written whole, and only ever by its owner.
     */
    savedTemples: { type: [String], default: [] },
    /** Which policy version this devotee accepted, per policy key. */
    acceptedPolicies: { type: Map, of: Number, default: {} },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
