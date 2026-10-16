import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A phone an operator stopped from signing in (docs/USERS.md section 1) - the deterrent against block evasion by making a new account on the same device.
 * `deviceId` is the id the app reports as `X-Device-Id`. `reason` is internal; `message` / `messageHi` are what the person reads.
 * `until: null` = until an operator removes it; a past `until` is treated as not blocked (every check compares the date) and the sweeper deletes the row.
 * Collection `blockeddevices` in the identity database.
 */
const blockedDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, maxlength: 120 },
    /** The devotee whose block brought the device in, when it came from one (display only). */
    uid: { type: String, default: null },
    reason: { type: String, default: '', maxlength: 300 },
    message: { type: String, default: '', maxlength: 300 },
    messageHi: { type: String, default: '', maxlength: 300 },
    until: { type: Date, default: null },
    at: { type: Date, default: Date.now },
    by: { type: String, default: '' },
  },
  { timestamps: false },
);
blockedDeviceSchema.index({ at: -1 });
blockedDeviceSchema.index({ until: 1 }, { sparse: true });

export const BlockedDevice = model('BlockedDevice', blockedDeviceSchema);
