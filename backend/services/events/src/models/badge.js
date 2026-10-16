import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameHi: { type: String, default: '', trim: true },
    art: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

/** (uid, badgeSlug, eventSlug) unique: a badge is earned once per event. Written from phase 2. */
const userBadgeSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    badgeSlug: { type: String, required: true },
    eventSlug: { type: String, required: true },
    earnedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
userBadgeSchema.index({ uid: 1, badgeSlug: 1, eventSlug: 1 }, { unique: true });

export const Badge = mongoose.models.Badge || mongoose.model('Badge', schema);
export const UserBadge = mongoose.models.UserBadge || mongoose.model('UserBadge', userBadgeSchema);
