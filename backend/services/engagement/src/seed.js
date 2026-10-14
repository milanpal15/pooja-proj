import { DEFAULT_FLAGS, DEFAULT_SETTINGS } from './defaults.js';
import { Flag, Setting } from './models/index.js';

/** Idempotent; set-on-insert only, so an operator's edit is never overwritten. */
export async function seedEngagement() {
  for (const f of DEFAULT_FLAGS) await Flag.updateOne({ key: f.key }, { $setOnInsert: f }, { upsert: true });
  // Deployments seeded before coins existed still carry the old flag text (same migration the monolith ran).
  await Flag.updateOne({ key: 'payments', label: 'Payments' }, { $set: { label: 'Coin purchases', desc: 'Buying coins with Razorpay' } });
  for (const s of DEFAULT_SETTINGS) await Setting.updateOne({ key: s.key }, { $setOnInsert: s }, { upsert: true });
}
