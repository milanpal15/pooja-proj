import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Requests the version gate refused, per build per IST day (docs/RELEASES.md section 2). Flushed by the mobile BFF every 60 s. */
const schema = new Schema(
  {
    platform: { type: String, default: 'android' },
    versionCode: { type: Number, default: null },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    count: { type: Number, default: 0 },
  },
  { timestamps: false },
);
schema.index({ platform: 1, versionCode: 1, day: 1 }, { unique: true });

export const VersionBlockCount = model('VersionBlockCount', schema);
