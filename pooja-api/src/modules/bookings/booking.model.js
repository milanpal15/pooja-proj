import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const STATUSES = ['booked', 'sankalp', 'performed', 'cancelled'];

/**
 * A pooja a devotee booked and paid for in coins (docs/POOJA_AND_HOME.md §3).
 *
 * Titles, names and prices are copied in rather than joined: a booking is a
 * record of what was agreed, and renaming a pooja or raising a package's price
 * must not rewrite what someone already paid for. (Rows from the old seva
 * booking keep their legacy fields; they are not migrated.)
 */
const bookingSchema = new Schema(
  {
    /** Firebase uid of the devotee. Indexed — every devotee read is scoped by it. */
    uid: { type: String, required: true, index: true },
    /** Human-readable reference shown in the app and quoted to the temple. */
    bookingRef: { type: String, required: true, unique: true },
    kind: { type: String, default: 'pooja' },
    poojaSlug: { type: String, index: true },
    poojaTitle: String,
    poojaTitleHi: String,
    templeSlug: String,
    templeName: String,
    place: String,
    /** `YYYY-MM-DD`, or null for an every-day pooja. */
    poojaDate: { type: String, default: null },
    packageKey: String,
    packageName: String,
    packageNameHi: String,
    persons: Number,
    names: [{ _id: false, name: String, gotra: String }],
    prasad: { type: Boolean, default: false },
    address: { type: new Schema({ line1: String, city: String, pincode: String }, { _id: false }), default: undefined },
    packageCoins: Number,
    prasadCoins: { type: Number, default: 0 },
    /** Coins debited: package + prasad fee. */
    totalCoins: Number,
    /** The wallet debit that paid for this. */
    walletTxnId: String,
    /** Client-generated; with `uid` it makes a retried POST return the same booking. */
    requestId: String,
    status: { type: String, enum: STATUSES, default: 'booked', index: true },
    statusHistory: [{ _id: false, status: String, at: Date }],
    /** True when cancelling returned the coins. */
    refunded: { type: Boolean, default: false },
    /** Last moment a cancellation is accepted; null = until the pooja is under way. */
    cancelBy: { type: Date, default: null },
    /** The devotee's review, copied here for the booking view; the moderated copy is a PoojaReview. */
    review: { type: new Schema({ rating: Number, text: String, createdAt: Date }, { _id: false }), default: undefined },
    /** First name typed on the booking — what the admin list shows next to a ref. */
    devoteeName: String,
    gotra: String,
  },
  { timestamps: true },
);
bookingSchema.index({ uid: 1, createdAt: -1 });
bookingSchema.index({ uid: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export const Booking = model('Booking', bookingSchema);
