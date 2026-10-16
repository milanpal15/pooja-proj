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
    /**
     * `blocked` is the long-standing boolean every reader uses; it is KEPT, and kept in step with `block` by lib/blocks.js (set when a block is
     * written, cleared by an unblock or by the sweeper once `block.until` has passed). Readers that must be exact at this very instant ask
     * lib/blocks.js `isBlocked(doc, now)`, which also honours an `until` the sweeper has not reached yet. docs/USERS.md section 1.
     */
    blocked: { type: Boolean, default: false },
    /** Why and how long. `reason` is internal (operators only); `message` / `messageHi` are what the person reads. null = never blocked. */
    block: {
      type: new Schema(
        {
          active: { type: Boolean, default: true },
          scope: { type: String, default: 'account' },
          reason: { type: String, maxlength: 300 },
          message: { type: String, maxlength: 300 },
          messageHi: { type: String, maxlength: 300 },
          until: { type: Date, default: null },
          at: Date,
          by: String,
        },
        { _id: false },
      ),
      default: null,
    },
    /** The last 20 block changes, oldest first (views reverse it). */
    blockHistory: {
      type: [
        new Schema(
          { action: { type: String, enum: ['block', 'unblock', 'auto_unblock'] }, at: Date, by: String, reason: String, message: String, until: { type: Date, default: null } },
          { _id: false },
        ),
      ],
      default: [],
    },
    /** Operator labels (<= 10, each <= 24 chars, lowercase slugs). */
    tags: { type: [String], default: [] },
    /** Operator notes, newest first, <= 50. */
    notes: {
      type: [new Schema({ id: String, text: { type: String, maxlength: 500 }, by: String, at: Date }, { _id: false })],
      default: [],
    },
    /** Lower-cased copies the list's prefix search runs on (indexed), kept in step by the hooks below. */
    nameLower: { type: String, default: '' },
    emailLower: { type: String },
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

// The Users list (docs/USERS.md section 2): cursor paging on (sort field, _id), prefix search on lower-cased name / email, phone, uid, contact.
userSchema.index({ lastActive: -1, _id: -1 });
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ nameLower: 1, _id: 1 });
userSchema.index({ emailLower: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ tags: 1 });
userSchema.index({ 'block.active': 1, 'block.until': 1 });

const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** Keep the search copies in step wherever a name / email is written (auth sync and profile edits use findOneAndUpdate). */
function syncSearchCopies() {
  const set = this.getUpdate?.()?.$set;
  if (!set || Array.isArray(this.getUpdate())) return;
  if ('name' in set) set.nameLower = lower(set.name);
  if ('email' in set) set.emailLower = lower(set.email);
}
userSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], syncSearchCopies);
userSchema.pre('save', function copies() {
  if (this.isModified('name') || this.isNew) this.nameLower = lower(this.name);
  if (this.isModified('email') || this.isNew) this.emailLower = lower(this.email) || undefined;
});

export const User = model('User', userSchema);
