import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * The old flat catalogue (flowers, prasad…) from the free-amount chadhava.
 * Kept so its dashboard page keeps working until the listings replace it;
 * the new flow prices from a listing's own `offerings`, never from here.
 */
const offeringSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    nameHi: String,
    coins: { type: Number, required: true },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** A grouping shown as chips above the listings. */
const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    nameHi: String,
    image: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const listingOfferingSchema = new Schema(
  {
    key: { type: String, required: true },
    title: String,
    titleHi: String,
    desc: String,
    descHi: String,
    coins: { type: Number, required: true },
    image: String,
    label: String,
    labelHi: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

/** A chadhava a temple is taking offerings for, within a window (docs/POOJA_AND_HOME.md §4). */
const listingSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    titleHi: String,
    templeSlug: String,
    place: String,
    category: String,
    summary: String,
    summaryHi: String,
    banner: String,
    gallery: { type: [String], default: [] },
    intro: String,
    introHi: String,
    howItWorks: { type: [new Schema({ text: String, textHi: String }, { _id: false })], default: [] },
    offerings: { type: [listingOfferingSchema], default: [] },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Offering = model('Offering', offeringSchema);
export const ChadhavaCategory = model('ChadhavaCategory', categorySchema);
export const ChadhavaListing = model('ChadhavaListing', listingSchema);
