import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * A phone that can be pushed to: its Firebase Cloud Messaging registration token, tied to the signed-in account.
 *
 * One account can have several phones; one token belongs to ONE account at a time (signing in on a shared phone moves
 * the token to the new account, so the previous person never receives the next person's notifications).
 * Collection `pushdevices` in the identity database.
 */
const pushDeviceSchema = new Schema(
  {
    uid: { type: String, required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const PushDevice = model('PushDevice', pushDeviceSchema);
