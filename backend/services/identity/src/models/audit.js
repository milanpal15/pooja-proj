import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Who changed what, and when — append-only (DESIGN.md §21.5.7).
 *
 * Deliberately stores NO request body: bodies carry passwords, sign-in
 * identifiers and devotee details, and a log of them would be a second copy of
 * the very data the role model exists to protect. It records the fact of the
 * change; the data itself stays where it is. The only exception is `before` / `after`,
 * which a service volunteers (never the raw body) for configuration writes.
 */
const auditSchema = new Schema(
  {
    operator: { type: String, required: true, index: true },
    role: String,
    area: String,
    method: String,
    path: String,
    targetId: String,
    status: Number,
    /*
     * What changed, for the writes that report it (version policy, releases, approvals, roles, operator role changes): sanitised and
     * size-bounded by @bhakti/common `sanitizeAuditDetail` - secrets and personal data never reach here. `selfApproved` marks a risky
     * change the only possible approver applied to their own request.
     */
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    selfApproved: Boolean,
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

auditSchema.index({ area: 1, _id: -1 });
auditSchema.index({ operator: 1, _id: -1 });

export const AuditLog = model('AuditLog', auditSchema);
