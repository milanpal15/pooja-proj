import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A slide in the Home carousel. Seasonal copy that should not need a build. */
/** Where a slide leads. Resolved to `href` on read (resources/hero-target.js). */
const targetSchema = new Schema(
  { type: { type: String, enum: ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'link', 'none'], default: 'none' }, ref: { type: String, default: '' } },
  { _id: false },
);

const heroSlideSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    /** Small pill above the title, optional. */
    tag: String,
    tagHi: String,
    title: String,
    titleHi: String,
    subtitle: String,
    subtitleHi: String,
    deitySlug: String,
    /** Optional in-app route (`/darshan`) or https URL. */
    href: String,
    /** `banner` = an image (or the deity art); `html` = operator-written, sanitised markup. */
    kind: { type: String, enum: ['banner', 'html'], default: 'banner' },
    image: String,
    /** Already sanitised — see modules/home/html-sanitizer.js. Cleaned again on read. */
    html: String,
    htmlHi: String,
    ctaLabel: String,
    ctaLabelHi: String,
    ctaHref: String,
    target: { type: targetSchema, default: undefined },
    /** Audience: the app shows slides for its language or `all`. */
    language: { type: String, enum: ['all', 'hi', 'en'], default: 'all' },
    /** Schedule window; null = no bound on that side. */
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const HeroSlide = model('HeroSlide', heroSlideSchema);
