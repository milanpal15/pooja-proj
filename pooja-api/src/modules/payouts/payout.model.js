import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * What an astrologer earned for ONE billed minute. Written by the billing path,
 * keyed (callId, minute) so a retried tick cannot earn twice. A connect-failure
 * refund `void`s the row instead of deleting it, so the books show what happened.
 */
const earningSchema = new Schema(
  {
    astrologerId: { type: Schema.Types.ObjectId, required: true, index: true },
    callId: { type: Schema.Types.ObjectId, required: true },
    minute: { type: Number, required: true },
    coins: { type: Number, required: true },
    /** Rupee value in paise at the payout rate in force when the minute was billed. */
    paise: { type: Number, required: true },
    at: { type: Date, required: true },
    voidedAt: Date,
  },
  { timestamps: true },
);
earningSchema.index({ callId: 1, minute: 1 }, { unique: true });
earningSchema.index({ astrologerId: 1, at: -1 });

/** A manual bank payout the operator recorded. This system never moves money. */
const payoutSchema = new Schema(
  {
    astrologerId: { type: Schema.Types.ObjectId, required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    paidAt: { type: Date, default: Date.now },
    reference: { type: String, default: '' },
    recordedBy: String,
  },
  { timestamps: true },
);

export const AstrologerEarning = model('AstrologerEarning', earningSchema);
export const Payout = model('Payout', payoutSchema);
