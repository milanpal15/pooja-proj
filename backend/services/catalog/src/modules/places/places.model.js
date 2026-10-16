import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One cached Overpass answer per (snapped lat, snapped lng, radius bucket). `places` is the NORMALISED list (not Overpass's raw JSON).
 * `expiresAt` = when it stops being fresh (fetchedAt + PLACES_CACHE_DAYS). The TTL index is on `purgeAt`, LATER than that, because an
 * expired row is still wanted: stale-while-error serves it when every Overpass instance is down. See docs/TEMPLE_MAP.md.
 */
const placeCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    radius: { type: Number, required: true },
    places: { type: [Schema.Types.Mixed], default: [] },
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { minimize: false },
);
placeCacheSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const PlaceCache = model('PlaceCache', placeCacheSchema);
