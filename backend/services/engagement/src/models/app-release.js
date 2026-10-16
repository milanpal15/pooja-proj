import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A published (or planned) build of the app (docs/RELEASES.md section 2). The registry gives version codes their human names. */
const appReleaseSchema = new Schema(
  {
    platform: { type: String, enum: ['android'], default: 'android' },
    versionName: { type: String, required: true, trim: true, maxlength: 40 },
    versionCode: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '', maxlength: 2000 },
    notesHi: { type: String, default: '', maxlength: 2000 },
    storeUrl: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['draft', 'live', 'withdrawn'], default: 'draft', index: true },
    releasedAt: Date,
    createdBy: String,
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);
appReleaseSchema.index({ platform: 1, versionCode: 1 }, { unique: true });

export const AppRelease = model('AppRelease', appReleaseSchema);
