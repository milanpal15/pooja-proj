import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A bookable rite, with its price.
 *
 * Prices were hardcoded in the app bundle (`constants/poojas.ts`), so
 * changing one — or charging differently at different temples — needed a
 * Play Store release. Money is the last thing that should require a release.
 */
const sevaSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String,
    nameHi: String,
    description: String,
    descriptionHi: String,
    price: { type: Number, default: 0 },
    duration: String,
    /** Restrict to one temple; blank = offered everywhere. */
    templeSlug: String,
    /** Deity slugs this rite suits; empty = universal. */
    deitySlugs: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Seva = model('Seva', sevaSchema);
