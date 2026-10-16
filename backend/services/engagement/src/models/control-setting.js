import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Control-plane switches that are NOT app settings: kept apart from `Setting`, whose rows `GET /api/content` hands to every phone.
 * Today: `approvalsEnabled` (docs/RELEASES.md section 5).
 */
const schema = new Schema(
  { key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed, updatedBy: String },
  { timestamps: { createdAt: false, updatedAt: 'updatedAt' } },
);

export const ControlSetting = model('ControlSetting', schema);
