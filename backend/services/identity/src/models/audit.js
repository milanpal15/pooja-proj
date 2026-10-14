import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Who changed what, and when — append-only (DESIGN.md §21.5.7).
 *
 * Deliberately stores NO request body: bodies carry passwords, sign-in
 * identifiers and devotee details, and a log of them would be a second copy of
 * the very data the role model exists to protect. It records the fact of the
 * change; the data itself stays where it is.
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
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export const AuditLog = model('AuditLog', auditSchema);
