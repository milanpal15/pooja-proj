import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * What the server tells each build to do (docs/RELEASES.md section 2). Exactly ONE document per platform (`platform` is unique);
 * seeded with every gate empty. `version` increments on every change, so a stale approval is detectable.
 */
const versionPolicySchema = new Schema(
  {
    platform: { type: String, enum: ['android'], default: 'android', unique: true },
    minVersionCode: { type: Number, default: null },
    recommendedVersionCode: { type: Number, default: null },
    blockedVersionCodes: { type: [Number], default: [] },
    minOsApi: { type: Number, default: null },
    graceUntil: { type: Date, default: null },
    snoozeDays: { type: Number, default: 3, min: 1, max: 30 },
    message: { type: String, default: '', maxlength: 300 },
    messageHi: { type: String, default: '', maxlength: 300 },
    storeUrl: { type: String, default: '', maxlength: 500 },
    maintenance: {
      enabled: { type: Boolean, default: false },
      message: { type: String, default: '', maxlength: 300 },
      messageHi: { type: String, default: '', maxlength: 300 },
      until: { type: Date, default: null },
      allowUids: { type: [String], default: [] },
    },
    /** Also refuse app routes from callers that send no `X-App-Version-Code`. */
    blockUnversioned: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: { createdAt: false, updatedAt: 'updatedAt' }, minimize: false },
);

export const VersionPolicy = model('VersionPolicy', versionPolicySchema);
