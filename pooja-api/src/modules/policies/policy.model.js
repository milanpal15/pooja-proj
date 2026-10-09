import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A versioned policy document — rules & regulations, privacy, refunds.
 *
 * One document per `key`. `version` is what makes acceptance meaningful:
 * bumping it invalidates every prior acceptance, so a material change to the
 * rules forces devotees to read and accept again. Editing typos without a
 * bump leaves existing acceptances intact, which is the whole point of
 * separating "save" from "publish".
 */
const policySchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // 'terms'
    title: String,
    /** Markdown. Rendered by the app, authored in the dashboard. */
    bodyMd: String,
    version: { type: Number, default: 1 },
    publishedAt: Date,
  },
  { timestamps: true },
);

export const Policy = model('Policy', policySchema);
