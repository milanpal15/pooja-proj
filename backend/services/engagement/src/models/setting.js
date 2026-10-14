import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Loose key/value app settings (collection `settings`). Values are strings; callers coerce. */
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
