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
    accent: { type: String, default: '#FFC13D' }, // halo + glow
    /**
     * What the devotee may offer. Was compiled into the app.
     */
    offerings: { type: [String], default: undefined },

    /**
     * How the sanctum DRAWS this deity when there is no photograph.
     *
     * The app renders a procedural murti — a figure built from shapes and
     * tinted by these — and falls back to it whenever `imageUrl` is unset.
     * These lived in the app bundle, which meant adding a deity from the
     * dashboard produced an untinted, crownless figure. Blank is fine: the
     * app keeps its own defaults for anything absent.
     */
    body: String, // skin / murti tone
    robe: String,
    trim: String, // garlands, crown, jewellery
    crown: String, // 'jata' | 'mukut' | 'crown' | 'none' — see the app's CrownKind
    crescent: Boolean, // moon in the hair (Shiva)
    serpent: Boolean, // cobra at the shoulder (Shiva)
    elephant: Boolean, // elephant head (Ganesha)
    mace: Boolean, // gada at the side (Hanuman)

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
    /**
     * Devotee rating, 0–5, and how many ratings it is based on.
     *
     * Optional on purpose. Every temple card used to print the same
     * hardcoded "4.9 stars (25k reviews)" from a single i18n string, which
     * is invented social proof; the app now hides the row entirely unless
     * real numbers are entered here.
     */
    rating: Number,
    reviews: Number,
    /**
     * Live darshan stream for this temple.
     *
     * A YouTube link (watch / youtu.be / live) is embedded in a player; any
     * other URL is treated as a direct stream (HLS `.m3u8` or progressive
     * mp4) and handed to the native video player.
     *
     * Empty means this temple is not streaming: the app shows the still
     * artwork with no LIVE badge, rather than claiming a feed that does not
     * exist — which is exactly what the screen used to do.
     */
    liveUrl: String,
    /*
     * Presentation data that used to live only in the app bundle
     * (`constants/temples.ts`). Without it a temple added from the dashboard
     * rendered with no colours and no map pin, because the sanctum re-themes
     * per temple and the pilgrimage map places markers by these numbers.
     * All optional — the bundled catalogue is still the fallback.
     */
    mark: String, // devanagari glyph on the idol's halo
    backdropFrom: String,
    backdropTo: String,
    accent: String,
    trim: String,
    idol: String,
    mapX: Number,
    mapY: Number,
    lat: Number,
    lng: Number,
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
    /** Verified from the token when present — never trusted from the body. */
    email: String,
    phone: String,
    photoUrl: String,
    bio: String,
    deviceId: String,
    blocked: { type: Boolean, default: false },
    /** Which policy version this devotee accepted, per policy key. */
    acceptedPolicies: { type: Map, of: Number, default: {} },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/**
 * A bookable rite, with its price.
 *
 * Prices were hardcoded in the app bundle (`constants/poojas.ts`), so
 * changing one — or charging differently at different temples — needed a
 * Play Store release. Money is the last thing that should require a release.
 */
const sevaSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String,
    nameHi: String,
    description: String,
    descriptionHi: String,
    price: { type: Number, default: 0 },
    duration: String,
    /** Restrict to one temple; blank = offered everywhere. */
    templeSlug: String,
    /** Deity slugs this rite suits; empty = universal. */
    deitySlugs: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * Deity lore for the Knowledge screen.
 *
 * Mirrors the bundled `LORE` shape exactly — epithet, prose, a fact table,
 * scriptures and festivals — so the dashboard edits the structure the screen
 * already renders rather than a lossy approximation of it.
 */
const knowledgeSchema = new Schema(
  {
    deitySlug: { type: String, required: true, unique: true, index: true },
    epithet: String,
    epithetHi: String,
    about: String,
    aboutHi: String,
    /** Key/value rows: Abode, Vahana, Consort… */
    facts: { type: [{ k: String, kHi: String, v: String, vHi: String }], default: [] },
    texts: { type: [String], default: [] },
    textsHi: { type: [String], default: [] },
    festivals: { type: [String], default: [] },
    festivalsHi: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** One question and answer on the Help & Support screen. */
const faqSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    category: String, // booking | prasad | chadhava | virtual | account
    categoryTitle: String,
    categoryTitleHi: String,
    question: String,
    questionHi: String,
    answer: String,
    answerHi: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** A slide in the Home carousel. Seasonal copy that should not need a build. */
const heroSlideSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: String,
    titleHi: String,
    subtitle: String,
    subtitleHi: String,
    deitySlug: String,
    /** Optional in-app route, e.g. `/darshan`. */
    href: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * Loose key/value app settings — fees, contact details, anything that is one
 * value rather than a list. Stored as strings so the dashboard needs no
 * per-key schema; callers coerce.
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: String,
    label: String,
    desc: String,
  },
  { timestamps: true },
);

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

export const Flag = model('Flag', flagSchema);
export const Visitor = model('Visitor', visitorSchema);
export const Event = model('Event', eventSchema);
export const Payment = model('Payment', paymentSchema);
export const Deity = model('Deity', deitySchema);
export const Temple = model('Temple', templeSchema);
export const Aarti = model('Aarti', aartiSchema);
export const User = model('User', userSchema);
export const Festival = model('Festival', festivalSchema);
export const Horoscope = model('Horoscope', horoscopeSchema);
export const Panchang = model('Panchang', panchangSchema);
export const Seva = model('Seva', sevaSchema);
export const Knowledge = model('Knowledge', knowledgeSchema);
export const Faq = model('Faq', faqSchema);
export const HeroSlide = model('HeroSlide', heroSlideSchema);
export const Setting = model('Setting', settingSchema);
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
  /**
   * SMS OTP sign-in. **Off by default**, unlike every other flag.
   *
   * Firebase stopped sending verification SMS on the free Spark plan in
   * September 2024 — it now needs a Blaze billing account and charges per
   * message. With this off the app offers Google sign-in only, instead of a
   * Mobile button that always fails with BILLING_NOT_ENABLED. Turn it on the
   * day billing is enabled; no app release needed.
   */
  { key: 'phoneAuth', label: 'Mobile OTP Sign-in', desc: 'Needs Firebase Blaze billing', enabled: false },
];
