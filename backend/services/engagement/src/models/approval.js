import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A risky change waiting for a second operator (docs/RELEASES.md section 2). A pending request expires 24 h after it was made. */
const approvalSchema = new Schema(
  {
    type: { type: String, enum: ['version_policy'], default: 'version_policy' },
    /** `{ before, after }`: both are full policy field sets (lib/policy.js `fieldsOf`). */
    payload: { type: Schema.Types.Mixed, required: true },
    summary: { type: String, default: '', maxlength: 600 },
    requestedBy: { type: String, required: true },
    /** The operator id (token `sub`), compared for "approver is not the requester"; `requestedBy` is the name shown. */
    requestedById: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired', 'cancelled'], default: 'pending', index: true },
    decidedBy: String,
    decidedAt: Date,
    note: { type: String, default: '', maxlength: 500 },
    expiresAt: { type: Date, required: true, index: true },
    selfApproved: { type: Boolean, default: false },
  },
  { timestamps: false, minimize: false },
);
approvalSchema.index({ requestedAt: -1 });

export const ApprovalRequest = model('ApprovalRequest', approvalSchema);
