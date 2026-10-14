import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** An aarti / bhajan track. */
const aartiSchema = new Schema(
  {
    title: String,
    artist: String,
    deitySlug: String,
    audioUrl: String, // uploaded or external
    duration: String, // "5:10"
    /**
     * Which shelf of the Bhajan library this sits on.
     *
     * The screen had its own hardcoded track list with these three
     * categories baked in, so the six aartis managed here were invisible
     * there and the six shown could not be changed. One list now, sorted
     * by this.
     */
    category: {
      type: String,
      enum: ['morning', 'evening', 'meditation'],
      default: 'morning',
      index: true,
    },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Aarti = model('Aarti', aartiSchema);
