import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A devotee's coin balance. A CACHE of the ledger, never edited directly:
 * every change goes through `wallet.service`, which writes a `WalletTxn` first.
 *
 * `applied` holds the ids of the last transactions already folded into
 * `balance`. It is what lets a debit be retried after a crash without being
 * applied twice, with no multi-document transaction (a standalone MongoDB
 * does not have them).
 */
const walletSchema = new Schema(
  {
    /** Firebase uid — the same key bookings use. */
    uid: { type: String, required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    applied: { type: [String], default: [] },
  },
  { timestamps: true },
);

/**
 * One coin movement. APPEND-ONLY: a mistake is corrected by a new row
 * (`refund` / `adjustment`), never by editing this one.
 *
 * `amount` is signed (+ in, − out). `status` is `pending` only between "we
 * decided to charge" and "the balance changed"; the reconciler sweeps strays.
 */
const walletTxnSchema = new Schema(
  {
    uid: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        'recharge', // coins bought with money
        'bonus', // welcome / goodwill credit
        'booking_debit',
        'chadhava_debit',
        'call_debit',
        'refund',
        'adjustment', // operator correction (reason required)
      ],
      index: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: Number,
    status: { type: String, enum: ['pending', 'posted', 'failed'], default: 'pending', index: true },
    /** What this was for: `order` | `booking` | `chadhava` | `call` | `admin`. */
    refType: String,
    refId: String,
    /** Unique per money movement; a retry with the same key never moves money twice. */
    idempotencyKey: { type: String, required: true, unique: true },
    note: String,
    /** Operator username for adjustments. */
    createdBy: String,
    failReason: String,
  },
  { timestamps: true },
);
walletTxnSchema.index({ uid: 1, createdAt: -1 });

export const Wallet = model('Wallet', walletSchema);
export const WalletTxn = model('WalletTxn', walletTxnSchema);
