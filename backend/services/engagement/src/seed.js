import { DEFAULT_FLAGS, DEFAULT_SETTINGS } from './defaults.js';
import { ControlSetting, Flag, Setting, VersionPolicy, Visitor } from './models/index.js';

/** Idempotent; set-on-insert only, so an operator's edit is never overwritten. */
export async function seedEngagement() {
  for (const f of DEFAULT_FLAGS) await Flag.updateOne({ key: f.key }, { $setOnInsert: f }, { upsert: true });
  // Deployments seeded before coins existed still carry the old flag text (same migration the monolith ran).
  await Flag.updateOne({ key: 'payments', label: 'Payments' }, { $set: { label: 'Coin purchases', desc: 'Buying coins with Razorpay' } });
  for (const s of DEFAULT_SETTINGS) await Setting.updateOne({ key: s.key }, { $setOnInsert: s }, { upsert: true });
  // App releases (docs/RELEASES.md): one policy per platform with every gate empty and maintenance off; no releases. Never overwrites an edit.
  await VersionPolicy.updateOne({ platform: 'android' }, { $setOnInsert: { platform: 'android' } }, { upsert: true });
  await ControlSetting.updateOne({ key: 'approvalsEnabled' }, { $setOnInsert: { key: 'approvalsEnabled', value: true } }, { upsert: true });
  // In-place upgrade of the device registry: rows written before it have `lastActive` only; give them the registry's clock.
  await Visitor.updateMany({ lastSeen: { $exists: false }, lastActive: { $exists: true } }, [{ $set: { lastSeen: '$lastActive' } }]);
}
