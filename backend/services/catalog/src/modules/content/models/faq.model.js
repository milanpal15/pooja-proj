import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** One question and answer on the Help & Support screen. */
const faqSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    category: String, // booking | prasad | chadhava | virtual | account
    categoryTitle: String,
    categoryTitleHi: String,
    question: String,
    questionHi: String,
    answer: String,
    answerHi: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Faq = model('Faq', faqSchema);
