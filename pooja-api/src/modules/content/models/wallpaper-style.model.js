import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Wallpaper looks the app can compose. Presentation, but the temple's choice. */
const wallpaperStyleSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: String,
    titleHi: String,
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const WallpaperStyle = model('WallpaperStyle', wallpaperStyleSchema);
