import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A paid chadhava. Item names and prices are copied in: a receipt records what
 * was agreed, so a later price change must not rewrite it. The pre-listing
 * fields (`amount`, `itemsTotal`, `serviceFee`, `total`) stay for old rows.
 */
const chadhavaOrderSchema = new Schema(
  {
    uid: { type: String, required: true, index: true },
    ref: { type: String, required: true, unique: true },
    listingSlug: String,
    listingTitle: String,
    listingTitleHi: String,
    templeSlug: String,
    templeName: String,
    items: [{ _id: false, key: String, title: String, name: String, qty: Number, coins: Number }],
    totalCoins: Number,
    status: { type: String, enum: ['booked', 'offered', 'cancelled'], default: 'booked', index: true },
    refunded: { type: Boolean, default: false },
    /** The listing's `endsAt` when ordered: the last moment a cancellation is accepted. */
    cancelBy: { type: Date, default: null },
    requestId: String,
    walletTxnId: String,
    amount: Number,
    itemsTotal: Number,
    serviceFee: Number,
    total: Number,
  },
  { timestamps: true },
);
chadhavaOrderSchema.index({ uid: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });

export const ChadhavaOrder = model('ChadhavaOrder', chadhavaOrderSchema);
