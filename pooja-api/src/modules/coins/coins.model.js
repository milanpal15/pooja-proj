import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A pack of coins for sale. An operator enters only `coins` and `price`;
 * everything shown as a sale ("50% EXTRA") is derived by `describePack`, so it
 * cannot disagree with them.
 */
const coinPackSchema = new Schema(
  {
    coins: { type: Number, required: true },
    /** Whole rupees. Packs are whole-rupee; the order carries the paise. */
    price: { type: Number, required: true },
    showSale: { type: Boolean, default: true },
    saleEndsAt: Date,
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/**
 * One attempt to buy a pack.
 *
 * `coins` and `pricePaise` are a SNAPSHOT taken when the order is created: an
 * operator editing the pack while a devotee is in the payment sheet must not
 * change what that payment buys. Crediting always reads the snapshot.
 */
const coinOrderSchema = new Schema(
  {
    uid: { type: String, required: true, index: true },
    packId: Schema.Types.ObjectId,
    coins: { type: Number, required: true },
    price: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    provider: { type: String, enum: ['razorpay', 'mock'], required: true },
    razorpayOrderId: { type: String, index: true, sparse: true },
    razorpayPaymentId: String,
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
    paidAt: Date,
    walletTxnId: String,
  },
  { timestamps: true },
);

export const CoinPack = model('CoinPack', coinPackSchema);
export const CoinOrder = model('CoinOrder', coinOrderSchema);
