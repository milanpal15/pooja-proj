/** The "New release" wizard and the release rows (docs/RELEASES.md §2). */

export const STEPS = ['Build', 'Notes', 'Rollout', 'Review'];

export const blankRelease = (storeUrl = '') => ({
  versionName: '',
  versionCode: '',
  notes: '',
  notesHi: '',
  storeUrl,
  status: 'live',
  recommend: true,
  setMinimum: false,
  graceUntil: '',
});

/** Errors for one step (0-based), or for all steps when `step` is null. `existingCodes` = builds already registered. */
export function validateRelease(f, step, existingCodes = [], editing = false) {
  const e = {};
  if (step === null || step === 0) {
    const name = f.versionName.trim();
    if (!name) e.versionName = 'Enter the version name people see, such as 1.4.0.';
    else if (name.length > 40) e.versionName = 'At most 40 characters.';
    const code = String(f.versionCode).trim();
    if (!/^\d+$/.test(code) || Number(code) < 1) e.versionCode = 'The build number is a whole number, 1 or more (expo android.versionCode).';
    else if (!editing && existingCodes.includes(Number(code))) e.versionCode = `Build ${code} is already registered.`;
    if (f.storeUrl.trim() && !/^https?:\/\/\S+$/i.test(f.storeUrl.trim())) e.storeUrl = 'Use a full link starting with https://';
  }
  if (step === null || step === 1) {
    if (f.notes.length > 2000) e.notes = 'At most 2000 characters.';
    if (f.notesHi.length > 2000) e.notesHi = 'At most 2000 characters.';
  }
  return e;
}

export const toReleaseBody = (f) => ({
  platform: 'android',
  versionName: f.versionName.trim(),
  versionCode: Number(String(f.versionCode).trim()),
  notes: f.notes.trim(),
  notesHi: f.notesHi.trim(),
  storeUrl: f.storeUrl.trim(),
  status: f.status,
});

/**
 * What the wizard's last step does to the policy, as the fields to change (merged onto the saved policy by the caller),
 * or null when it changes nothing. A draft release never touches the policy.
 */
export function policyPatch(f) {
  if (f.status !== 'live') return null;
  const code = Number(String(f.versionCode).trim());
  const patch = {};
  if (f.recommend) patch.recommendedVersionCode = code;
  if (f.setMinimum) {
    patch.minVersionCode = code;
    patch.recommendedVersionCode = Math.max(code, patch.recommendedVersionCode ?? 0);
    if (f.graceUntil) patch.graceUntil = f.graceUntil; // local datetime; the caller converts
  }
  return Object.keys(patch).length ? patch : null;
}

/** Releases newest build first; each carries the tags the current policy gives it. */
export function timeline(releases, policy, usage) {
  const byCode = new Map((usage?.byVersion || []).map((v) => [v.versionCode, v]));
  const blocked = new Set(policy?.blockedVersionCodes || []);
  return [...(releases || [])]
    .sort((a, b) => b.versionCode - a.versionCode)
    .map((r) => {
      const tags = [];
      if (policy?.minVersionCode != null && r.versionCode === policy.minVersionCode) tags.push('Minimum');
      if (policy?.recommendedVersionCode != null && r.versionCode === policy.recommendedVersionCode) tags.push('Recommended');
      if (blocked.has(r.versionCode)) tags.push('Blocked');
      const u = byCode.get(r.versionCode);
      return { ...r, tags, devices: u?.devices ?? null, activeDevices7d: u?.activeDevices7d ?? null };
    });
}
