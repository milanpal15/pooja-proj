import mongoose from 'mongoose';

/** A PRESET (name, colour, default blocks) - never a branch in code. Nothing may test `typeSlug === 'yatra'`. */
const schema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameHi: { type: String, default: '', trim: true },
    color: { type: String, default: '#7A1F2B' },
    gradient: { type: [String], default: undefined },
    description: { type: String, default: '' },
    /** Partial Event blocks used to prefill the editor. */
    defaults: { type: mongoose.Schema.Types.Mixed, default: {} },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false },
);

export const EventType = mongoose.models.EventType || mongoose.model('EventType', schema);
