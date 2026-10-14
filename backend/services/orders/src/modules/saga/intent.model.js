import mongoose from 'mongoose';

/**
 * A durable note of one money movement, written BEFORE the money moves (the saga of docs/MICROSERVICES.md section 4; semantics in saga.js).
 * Collection `orderintents`. It started life as the monolith's `WalletIntent` (collection `walletintents`) and moved here with the orders;
 * `tools/split-db.mjs --service orders` copies the booking / chadhava rows across, unfinished ones included, and this service's sweeper then
 * resolves them.
 */
const intentSchema = new mongoose.Schema(
  {
    /** The wallet idempotency key: one intent per money movement. */
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['booking', 'chadhava', 'refund'], required: true },
    uid: { type: String, required: true },
    amount: { type: Number, required: true },
    /** debit: the ledger type; refund: unused. */
    type: String,
    refType: String,
    refId: String,
    note: String,
    createdBy: String,
    /** refund: the idempotency key of the debit it reverses - the wallet verifies it before it pays anything. */
    ofKey: String,
    requestId: String,
    /** What the order is made from (booking / chadhava order fields), so the sweeper can write it without the original request. */
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'done', 'failed', 'expired', 'refunded'], default: 'pending', index: true },
    openedAt: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 },
    lastError: String,
  },
  { timestamps: true, minimize: false },
);
intentSchema.index({ status: 1, openedAt: 1 });
intentSchema.index({ status: 1, updatedAt: 1 });

export const OrderIntent = mongoose.models.OrderIntent || mongoose.model('OrderIntent', intentSchema, 'orderintents');
/** The statuses that are history, not work: only these are ever pruned. */
export const TERMINAL = ['done', 'failed', 'expired', 'refunded'];
