import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** One app install / device that has reported in. */
const visitorSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    model: String,
    os: String,
    appVersion: String,
    /** Expo push token, registered by the app when permission is granted. */
    pushToken: { type: String, index: true },
    sessions: { type: Number, default: 0 },
    firstSeen: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/** A generic analytics event (screen view, session start, custom). */
const eventSchema = new Schema(
  {
    type: { type: String, index: true }, // 'session' | 'screen' | custom
    screen: String,
    deviceId: { type: String, index: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export const Visitor = model('Visitor', visitorSchema);
export const Event = model('Event', eventSchema);
