import { HISTORY_LIMIT } from './blocks.js';
import { BlockedDevice, User } from '../models/index.js';

/**
 * Tidy up timed blocks that have run out (docs/USERS.md section 1). They stopped applying the moment `until` passed - every check compares the
 * date - so this only makes the stored state honest: `blocked` goes false, `block.active` goes false and an `auto_unblock` row joins the
 * history. Idempotent and safe to run on several instances at once (each write re-checks the block it is about to clear).
 * Expired device blocks are simply deleted. Returns how many accounts / devices were cleared.
 */
export async function sweepExpiredBlocks(now = new Date(), { batch = 500 } = {}) {
  const due = await User.find({ 'block.active': true, 'block.until': { $ne: null, $lte: now } }).limit(batch).lean();
  let accounts = 0;
  for (const u of due) {
    const res = await User.updateOne(
      { _id: u._id, 'block.active': true, 'block.until': u.block.until },
      {
        $set: { blocked: false, 'block.active': false },
        $push: { blockHistory: { $each: [{ action: 'auto_unblock', at: now, by: 'system', reason: u.block.reason || '', message: u.block.message || '', until: u.block.until }], $slice: -HISTORY_LIMIT } },
      },
    );
    accounts += res.modifiedCount;
  }
  const devices = (await BlockedDevice.deleteMany({ until: { $ne: null, $lte: now } })).deletedCount;
  return { accounts, devices };
}
