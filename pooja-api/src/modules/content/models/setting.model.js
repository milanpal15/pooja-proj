import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Loose key/value app settings — fees, contact details, anything that is one
 * value rather than a list. Stored as strings so the dashboard needs no
 * per-key schema; callers coerce.
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: String,
    label: String,
    desc: String,
  },
  { timestamps: true },
);

export const Setting = model('Setting', settingSchema);
