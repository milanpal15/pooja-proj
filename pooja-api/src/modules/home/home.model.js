import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SOURCES = ['hero', 'astrologer', 'grid', 'festivals', 'knowledge', 'temples', 'daily', 'features', 'darshan', 'custom'];
/** Sources whose content is its own `items`; with none, the section is not served. */
export const ITEM_SOURCES = ['grid', 'daily', 'features', 'knowledge', 'custom'];
export const TONES = ['gold', 'purple', 'crimson', 'forest', 'maroon'];
export const LAYOUTS = ['photo3', 'book2', 'list', 'grid4'];
export const BADGES = ['new', 'soon', 'special', ''];

const itemSchema = new Schema(
  {
    title: String,
    titleHi: String,
    subtitle: String,
    subtitleHi: String,
    /** App icon name, for grid / daily / features. */
    icon: String,
    image: String,
    /** In-app route. */
    href: String,
    badge: { type: String, enum: BADGES, default: '' },
    /** Feature-flag key; the app hides the item while that flag is off. */
    flag: String,
    deitySlug: String,
  },
  { _id: false },
);

/**
 * One band of the Home screen, in the order the dashboard sets.
 * Home used to be a fixed list of components in the app; this is the list.
 */
const homeSectionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    source: { type: String, enum: SOURCES, default: 'custom' },
    title: String,
    titleHi: String,
    tone: { type: String, enum: TONES, default: 'gold' },
    layout: { type: String, enum: LAYOUTS, default: 'list' },
    items: { type: [itemSchema], default: [] },
    footerLabel: String,
    footerLabelHi: String,
    footerHref: String,
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const HomeSection = model('HomeSection', homeSectionSchema);
