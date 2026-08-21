import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A toggleable app feature, controlled from the admin dashboard. */
const flagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: String,
    desc: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** One app install / device that has reported in. */
const visitorSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    model: String,
    os: String,
    appVersion: String,
    /** Expo push token, registered by the app when permission is granted. */
    pushToken: { type: String, index: true },
    sessions: { type: Number, default: 0 },
    firstSeen: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/** A generic analytics event (screen view, session start, custom). */
const eventSchema = new Schema(
  {
    type: { type: String, index: true }, // 'session' | 'screen' | custom
    screen: String,
    deviceId: { type: String, index: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

/** A payment attempt reported by the app (dummy Razorpay). */
const paymentSchema = new Schema(
  {
    amount: Number,
    method: String, // UPI | Card
    status: { type: String, index: true }, // success | failed
    note: String,
    deviceId: String,
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

/** A deity (god) shown in the app, with a manageable image. */
const deitySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String, // e.g. शिव जी
    title: String, // e.g. भगवान शिव
    mark: String, // ॐ
    mantra: String,
    imageUrl: String, // uploaded or external
    accent: { type: String, default: '#FFC13D' },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** A temple in the directory / map. */
const templeSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String,
    location: String,
    deitySlug: String, // links to a deity
    imageUrl: String,
    aartiTime: String, // e.g. "Mangala Aarti · 3:00 AM"
    offerings: [String],
    /**
     * Whether devotees can book a real pooja/seva AT this temple.
     *
     * Deliberately per-temple rather than a global feature flag: booking
     * depends on an arrangement with each temple's administration, so it
     * comes and goes one temple at a time. The global `virtualPooja` flag
     * is a different thing entirely — that gates the on-device aarti, which
     * needs no temple's cooperation.
     */
    bookingEnabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** An aarti / bhajan track. */
const aartiSchema = new Schema(
  {
    title: String,
    artist: String,
    deitySlug: String,
    audioUrl: String, // uploaded or external
    duration: String, // "5:10"
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * A versioned policy document — rules & regulations, privacy, refunds.
 *
 * One document per `key`. `version` is what makes acceptance meaningful:
 * bumping it invalidates every prior acceptance, so a material change to the
 * rules forces devotees to read and accept again. Editing typos without a
 * bump leaves existing acceptances intact, which is the whole point of
 * separating "save" from "publish".
 */
const policySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // 'terms'
    title: String,
    /** Markdown. Rendered by the app, authored in the dashboard. */
    bodyMd: String,
    version: { type: Number, default: 1 },
    publishedAt: Date,
  },
  { timestamps: true },
);

/**
 * A broadcast announcement, shown to every devotee as a full-screen modal.
 *
 * `active` is the switch; `startsAt`/`endsAt` let a festival notice be
 * scheduled rather than remembered. Devotees dismiss by id, so re-enabling an
 * old announcement does not re-show it to people who already saw it — publish
 * a new one instead.
 */
const announcementSchema = new Schema(
  {
    title: { type: String, required: true },
    bodyMd: String,
    /** info | festival | urgent — drives the modal's accent, not its layout. */
    severity: { type: String, default: 'info' },
    active: { type: Boolean, default: true },
    /**
     * How this reaches devotees. Both may be set.
     *   modal — full-screen takeover on next app open
     *   push  — Expo push notification, sent once at publish time
     */
    channels: { type: [String], default: ['modal'] },
    /** Stamped when the push fan-out ran, so publishing twice cannot double-send. */
    pushedAt: Date,
    pushStats: { sent: Number, failed: Number },
    startsAt: Date,
    endsAt: Date,
    /** A non-dismissible notice still closes; it just cannot be swiped away. */
    dismissible: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** An app user account (created at sign-in). */
const userSchema = new Schema(
  {
    contact: { type: String, required: true, unique: true, index: true },
    name: String,
    method: String, // phone | email
    bio: String,
    deviceId: String,
    blocked: { type: Boolean, default: false },
    /** Which policy version this devotee accepted, per policy key. */
    acceptedPolicies: { type: Map, of: Number, default: {} },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const Flag = model('Flag', flagSchema);
export const Visitor = model('Visitor', visitorSchema);
export const Event = model('Event', eventSchema);
export const Payment = model('Payment', paymentSchema);
export const Deity = model('Deity', deitySchema);
export const Temple = model('Temple', templeSchema);
export const Aarti = model('Aarti', aartiSchema);
export const User = model('User', userSchema);
export const Policy = model('Policy', policySchema);
export const Announcement = model('Announcement', announcementSchema);

/** Default features seeded on first run. */
export const DEFAULT_FLAGS = [
  { key: 'virtualPooja', label: 'Virtual Pooja', desc: 'Aarti experience', enabled: true },
  { key: 'bhajan', label: 'Bhajan Library', desc: 'Media library tab', enabled: true },
  { key: 'chadhava', label: 'E-Chadhava', desc: 'Offerings & checkout', enabled: true },
  { key: 'journal', label: 'Daily Journal', desc: 'Mantra journal', enabled: true },
  { key: 'liveDarshan', label: 'Live Darshan', desc: 'Live temple stream', enabled: true },
  { key: 'payments', label: 'Payments', desc: 'Razorpay checkout', enabled: true },
  { key: 'announcements', label: 'Announcements', desc: 'Temple banners', enabled: true },
];
