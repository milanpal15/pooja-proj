import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One voice call (DESIGN.md §19.3/§19.4).
 *
 * Rate and platform share are SNAPSHOTS: editing an astrologer mid-call must
 * never change what this call costs.
 *
 * `devoteeLive` / `astrologerLive` exist only to carry partial unique indexes.
 * They are `true` while the call is live (devotee: requested|connected;
 * astrologer: connected) and UNSET once it ends, so the database itself — not
 * a read-then-write check — guarantees "one live call per devotee" and "one
 * connected call per astrologer", even for two requests racing each other.
 */
const callSchema = new Schema(
  {
    devoteeUid: { type: String, required: true, index: true },
    devoteeName: { type: String, default: '' },
    astrologerId: { type: Schema.Types.ObjectId, required: true, index: true },
    astrologerUid: { type: String, required: true, index: true },
    astrologerName: { type: String, default: '' },
    astrologerPhotoUrl: { type: String, default: '' },
    requestId: String,
    status: { type: String, enum: ['requested', 'connected', 'ended'], default: 'requested', index: true },
    endReason: { type: String, enum: ['completed', 'declined', 'missed', 'cancelled', 'out_of_coins', 'failed', 'admin'] },
    ratePerMinSnapshot: { type: Number, required: true },
    shareSnapshot: { type: Number, required: true },
    requestedAt: { type: Date, required: true },
    answeredAt: Date,
    endedAt: Date,
    minutesBilled: { type: Number, default: 0 },
    coinsCharged: { type: Number, default: 0 },
    coinsRefunded: { type: Number, default: 0 },
    /** Goodwill refunds an operator issued (requestId makes a retry harmless). */
    refunds: { type: [{ requestId: String, coins: Number, reason: String, by: String, at: Date, _id: false }], default: [] },
    nextBillAt: { type: Date, index: true },
    rtcChannel: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    /** Last time each party's app polled the call — drives silence detection. */
    devoteeSeenAt: Date,
    astrologerSeenAt: Date,
    devoteeLive: Boolean,
    astrologerLive: Boolean,
  },
  { timestamps: true },
);
callSchema.index({ devoteeLive: 1 }, { unique: true, partialFilterExpression: { devoteeLive: true } });
callSchema.index({ astrologerLive: 1, astrologerId: 1 }, { unique: true, partialFilterExpression: { astrologerLive: true } });
callSchema.index({ devoteeUid: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } } });
callSchema.index({ astrologerId: 1, rating: 1 });

export const CallSession = model('CallSession', callSchema);
