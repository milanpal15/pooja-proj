import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A toggleable app feature, controlled from the admin dashboard. */
const flagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: String,
    desc: String,
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Flag = model('Flag', flagSchema);
