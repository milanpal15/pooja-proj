import mongoose from 'mongoose';

/**
 * A durable note of one REFUND, written BEFORE the money moves (the saga of docs/MICROSERVICES.md section 4; semantics in saga.js).
 * Collection `callintents`. It started life as the monolith's `WalletIntent` rows of kind `refund` / refType `call` (collection `walletintents`);
 * `tools/split-db.mjs --service calls` copies those across, unfinished ones included, and this service's sweeper then resolves them.
 *
 * A call's per-minute DEBITS need no intent (the call row's `nextBillAt` plus the key `call:<id>:min:<n>` is the durable note); only refunds do.
 */
const intentSchema = new mongoose.Schema(
  {
    /** The wallet idempotency key: one intent per money movement. */
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['refund'], required: true },
    uid: { type: String, required: true },
    amount: { type: Number, required: true },
    refType: String,
    refId: String,
    note: String,
    createdBy: String,
    /** The idempotency key of the debit this refund reverses - the wallet verifies it before it pays anything. */
    ofKey: String,
    /**
     * ONLY on a goodwill refund the monolith queued before this service existed (key `call:<id>:goodwill:<rid>`): the operator's reason, which was the
     * wallet's one exemption from `ofKey` for a refund with many debits behind it. This service never writes it on a new refund.
     */
    reason: String,
    requestId: String,
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

export const CallIntent = mongoose.models.CallIntent || mongoose.model('CallIntent', intentSchema, 'callintents');
/** The statuses that are history, not work: only these are ever pruned. */
export const TERMINAL = ['done', 'failed', 'expired', 'refunded'];
