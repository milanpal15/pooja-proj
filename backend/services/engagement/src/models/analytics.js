import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** One app install / device that has reported in (collection `visitors`). */
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

    /*
     * The device registry (docs/RELEASES.md section 1) - the same collection, extended in place; the fields above are unchanged.
     * Written by the policy call (once per launch / resume), NOT per request. `versionCode` is what version gating and the impact
     * numbers are counted from; legacy rows have none. `lastSeen` is the registry's clock (`lastActive` keeps meaning "last analytics ping").
     */
    platform: { type: String, maxlength: 16 },
    versionName: { type: String, maxlength: 40 },
    versionCode: { type: Number, min: 0 },
    osApi: { type: Number, min: 0 },
    /** The signed-in devotee on this device, when the policy call carried a verified token. */
    uid: { type: String, default: null, maxlength: 128 },
    lastSeen: { type: Date },
  },
  { timestamps: true },
);

visitorSchema.index({ lastSeen: -1 });
visitorSchema.index({ versionCode: 1, lastSeen: -1 });
visitorSchema.index({ uid: 1, lastSeen: -1 }, { sparse: true });

/** A generic analytics event: screen view, session start (collection `events`). */
const eventSchema = new Schema(
  {
    type: { type: String, index: true },
    screen: String,
    deviceId: { type: String, index: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

export const Visitor = model('Visitor', visitorSchema);
export const Event = model('Event', eventSchema);
