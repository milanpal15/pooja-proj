import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** A temple in the directory / map. */
const templeSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: String,
    location: String,
    deitySlug: String, // links to a deity
    /** Shown on a pooja's page under "About the temple". */
    about: String,
    aboutHi: String,
    imageUrl: String,
    aartiTime: String, // e.g. "Mangala Aarti · 3:00 AM"
    /**
     * Devotee rating, 0–5, and how many ratings it is based on.
     *
     * Optional on purpose. Every temple card used to print the same
     * hardcoded "4.9 stars (25k reviews)" from a single i18n string, which
     * is invented social proof; the app now hides the row entirely unless
     * real numbers are entered here.
     */
    rating: Number,
    reviews: Number,
    /**
     * Live darshan stream for this temple.
     *
     * A YouTube link (watch / youtu.be / live) is embedded in a player; any
     * other URL is treated as a direct stream (HLS `.m3u8` or progressive
     * mp4) and handed to the native video player.
     *
     * Empty means this temple is not streaming: the app shows the still
     * artwork with no LIVE badge, rather than claiming a feed that does not
     * exist — which is exactly what the screen used to do.
     */
    liveUrl: String,
    /*
     * Presentation data that used to live only in the app bundle
     * (`constants/temples.ts`). Without it a temple added from the dashboard
     * rendered with no colours and no map pin, because the sanctum re-themes
     * per temple and the pilgrimage map places markers by these numbers.
     * All optional — the bundled catalogue is still the fallback.
     */
    mark: String, // devanagari glyph on the idol's halo
    backdropFrom: String,
    backdropTo: String,
    accent: String,
    trim: String,
    idol: String,
    mapX: Number,
    mapY: Number,
    lat: Number,
    lng: Number,
    offerings: [String],
    /**
     * Whether devotees can book a real pooja/seva AT this temple.
     *
     * Deliberately per-temple rather than a global feature flag: booking
     * depends on an arrangement with each temple's administration, so it
     * comes and goes one temple at a time. The global `virtualPooja` flag
     * is a different thing entirely — that gates the on-device aarti, which
     * needs no temple's cooperation.
     */
    bookingEnabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Temple = model('Temple', templeSchema);
