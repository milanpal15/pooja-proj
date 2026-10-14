import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A devotee's review of a performed booking. One per booking (unique), never
 * edited; an operator can only hide it.
 */
const poojaReviewSchema = new Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    bookingRef: String,
    uid: { type: String, required: true, index: true },
    poojaSlug: { type: String, required: true, index: true },
    poojaTitle: String,
    packageName: String,
    /** First name only — never contact details. */
    name: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '' },
    hidden: { type: Boolean, default: false },
    /** Set when an operator changed the text. Admin-only; the public payload never shows it. */
    edited: { type: Boolean, default: false },
    editedAt: Date,
    /** The devotee's own words, kept the first time an operator edits. Admin-only. */
    originalText: String,
  },
  { timestamps: true },
);

export const PoojaReview = model('PoojaReview', poojaReviewSchema);
