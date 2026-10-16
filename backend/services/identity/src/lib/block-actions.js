import { DEFAULT_BLOCK_MESSAGE, DEFAULT_BLOCK_MESSAGE_HI } from '@bhakti/common';

import { HISTORY_LIMIT } from './blocks.js';
import { BlockedDevice, User } from '../models/index.js';

/**
 * The two writes behind block / unblock (docs/USERS.md section 2), shared by the routes and the legacy `PUT /admin/users/:id { blocked }`.
 * They keep `User.blocked` (the old boolean) in step with `User.block`, append the history row, and touch devices when asked.
 */

/** Block (or re-block: updating the message / end date of a block that is already on) one account. Revokes its Firebase refresh tokens. */
export async function applyBlock({ doc, input, by, now, firebase, deviceIds = [], stock = false }) {
  const message = stock ? DEFAULT_BLOCK_MESSAGE : input.message;
  const messageHi = stock ? DEFAULT_BLOCK_MESSAGE_HI : input.messageHi;
  const block = { active: true, scope: 'account', reason: input.reason, message, messageHi, until: input.until ?? null, at: now, by };
  const entry = { action: 'block', at: now, by, reason: input.reason, message, until: input.until ?? null };
  const out = await User.findOneAndUpdate(
    { _id: doc._id },
    { $set: { blocked: true, block }, $push: { blockHistory: { $each: [entry], $slice: -HISTORY_LIMIT } } },
    { new: true },
  );
  // The BFF refuses a blocked uid at once; revoking also stops a phone that still holds a refresh token from minting new ID tokens.
  if (out.uid) await firebase.revokeUser(out.uid);
  const devicesBlocked = await blockDevices(deviceIds, { uid: out.uid ?? null, reason: input.reason, message, messageHi, until: input.until ?? null, by, now });
  return { doc: out, devicesBlocked };
}

/** Lift a block (a no-op, with no history row, for an account that is not blocked). */
export async function applyUnblock({ doc, note, by, now, deviceIds = [] }) {
  const was = doc.blocked === true || doc.block?.active === true;
  let out = doc;
  if (was) {
    const kept = doc.block?.toObject?.() ?? doc.block ?? {};
    const entry = { action: 'unblock', at: now, by, reason: note || '', message: '', until: null };
    out = await User.findOneAndUpdate(
      { _id: doc._id },
      {
        $set: { blocked: false, block: { scope: 'account', ...kept, active: false, at: kept.at ?? now, by: kept.by ?? by } },
        $push: { blockHistory: { $each: [entry], $slice: -HISTORY_LIMIT } },
      },
      { new: true },
    );
  }
  const devicesUnblocked = deviceIds.length ? (await BlockedDevice.deleteMany({ deviceId: { $in: deviceIds } })).deletedCount : 0;
  return { doc: out, devicesUnblocked };
}

/** Block these devices (idempotent: an existing row is updated). Returns how many rows were written. */
export async function blockDevices(deviceIds, { uid = null, reason, message, messageHi = '', until = null, by, now }) {
  if (!deviceIds.length) return 0;
  await BlockedDevice.bulkWrite(
    deviceIds.map((deviceId) => ({
      updateOne: { filter: { deviceId }, update: { $set: { uid, reason, message, messageHi, until, at: now, by } }, upsert: true },
    })),
    { ordered: false },
  );
  return deviceIds.length;
}
