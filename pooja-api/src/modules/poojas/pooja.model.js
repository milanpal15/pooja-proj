import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const packageSchema = new Schema(
  {
    /** Stable id within the pooja (`individual`, `partner`…); bookings refer to it. */
    key: { type: String, required: true },
    name: String,
    nameHi: String,
    /** How many people the sankalp is taken for; a booking must supply exactly this many names. */
    persons: { type: Number, default: 1 },
    coins: { type: Number, required: true },
    perks: { type: [String], default: [] },
    perksHi: { type: [String], default: [] },
    image: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const titledText = { title: String, titleHi: String, text: String, textHi: String };

/**
 * A pooja a temple performs on a given day, with the packages a devotee can
 * book it in. Replaces the flat Seva price list for booking
 * (docs/POOJA_AND_HOME.md §2). Prices live HERE and are read from here at
 * booking time — never from the client.
 */
const poojaSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    titleHi: String,
    tagline: String,
    taglineHi: String,
    banner: String,
    templeSlug: String,
    place: String,
    festivalSlug: String,
    tithi: String,
    deitySlug: String,
    /** `YYYY-MM-DD` (IST), or null = performed every day. */
    poojaDate: { type: String, default: null },
    bookingClosesAt: { type: Date, default: null },
    /** Hours before the pooja day begins until which a booking may be cancelled with a refund. */
    cancelHours: { type: Number, default: 24 },
    /** Hidden from the app until then. */
    publishAt: { type: Date, default: null },
    gallery: { type: [String], default: [] },
    about: String,
    aboutHi: String,
    /** Optional per-pooja override of the temple block; blank = use the Temple's own text and image. */
    templeAbout: String,
    templeAboutHi: String,
    templeImage: String,
    benefits: { type: [new Schema(titledText, { _id: false })], default: [] },
    included: { type: [new Schema({ text: String, textHi: String }, { _id: false })], default: [] },
    process: { type: [new Schema(titledText, { _id: false })], default: [] },
    faqs: { type: [new Schema({ q: String, qHi: String, a: String, aHi: String }, { _id: false })], default: [] },
    prasadAvailable: { type: Boolean, default: false },
    prasadFeeCoins: { type: Number, default: 0 },
    packages: { type: [packageSchema], default: [] },
    /** Set by import-sevas, so a re-run skips what it already made. */
    importedFromSeva: String,
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/**
 * A devotee's review of a performed booking. One per booking (unique), never
 * edited; an operator can only hide it.
 */
const poojaReviewSchema = new Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    bookingRef: String,
    uid: { type: String, required: true, index: true },
    poojaSlug: { type: String, required: true, index: true },
    poojaTitle: String,
    packageName: String,
    /** First name only — never contact details. */
    name: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '' },
    hidden: { type: Boolean, default: false },
    /** Set when an operator changed the text. Admin-only; the public payload never shows it. */
    edited: { type: Boolean, default: false },
    editedAt: Date,
    /** The devotee's own words, kept the first time an operator edits. Admin-only. */
    originalText: String,
  },
  { timestamps: true },
);

export const Pooja = model('Pooja', poojaSchema);
export const PoojaReview = model('PoojaReview', poojaReviewSchema);
