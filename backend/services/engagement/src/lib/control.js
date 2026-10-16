import { AppRelease, ApprovalRequest, ControlSetting, VersionPolicy } from '../models/index.js';

export const APPROVAL_TTL_MS = 24 * 3600_000;

/** The one policy document for a platform, created empty if a database was never seeded. */
export async function getPolicy(platform = 'android') {
  return VersionPolicy.findOneAndUpdate({ platform }, { $setOnInsert: { platform } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

/** versionCode -> versionName for every registered release (withdrawn and draft too: a code still has a name). */
export async function releaseNames(platform = 'android') {
  const rows = await AppRelease.find({ platform }).select('versionCode versionName').lean();
  return new Map(rows.map((r) => [r.versionCode, r.versionName]));
}

export async function approvalsEnabled() {
  const row = await ControlSetting.findOne({ key: 'approvalsEnabled' }).lean();
  return row ? row.value !== false : true; // default ON
}

/** Pending requests past their expiry become `expired` (the sweeper runs this; listings run it too, so a stale row is never shown as pending). */
export async function expireApprovals(now = new Date()) {
  const r = await ApprovalRequest.updateMany({ status: 'pending', expiresAt: { $lte: now } }, { $set: { status: 'expired', decidedAt: now } });
  return r.modifiedCount ?? 0;
}
