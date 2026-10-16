/**
 * The version decision (docs/RELEASES.md section 3): ONE pure function, shared by the engagement service (the public policy answer)
 * and the mobile BFF (the version gate), so the two can never disagree about a build.
 *
 * Nothing here reads a clock, a database or the network: everything it needs is passed in.
 */

export const STATUSES = Object.freeze(['ok', 'update_available', 'unsupported_os', 'update_required', 'blocked', 'maintenance']);
/** The statuses that stop the app (426 / 503 from the gate, a full-screen block in the app). */
export const BLOCKING_STATUSES = Object.freeze(['maintenance', 'blocked', 'update_required']);
export const isBlocking = (status) => BLOCKING_STATUSES.includes(status);

/** A non-negative integer from a number or a plain digit string, else null (so `"12"` works, `"1e3"`, `-1`, `1.5`, `NaN`, `""`, objects do not). */
export function intOrNull(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 && v <= 999_999_999 ? v : null;
  if (typeof v === 'string' && /^\d{1,9}$/.test(v.trim())) return Number(v.trim());
  return null;
}

const ms = (d) => {
  if (d === null || d === undefined || d === '') return null;
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d);
  return Number.isFinite(t) ? t : null;
};
const iso = (d) => (ms(d) === null ? null : new Date(ms(d)).toISOString());
const text = (v) => (typeof v === 'string' ? v : '');

/** "build N" when the release registry does not know the code. `names`: a Map, a plain object, or a function code -> name. */
function nameOf(names, code) {
  if (code === null || code === undefined) return null;
  const n = typeof names === 'function' ? names(code) : names instanceof Map ? names.get(code) : names?.[code];
  return typeof n === 'string' && n ? n : `build ${code}`;
}

/**
 * @param {object|null} policy  a VersionPolicy (see docs/RELEASES.md section 2); null / undefined = no policy = everything is `ok`
 * @param {{ versionCode?: unknown, osApi?: unknown, uid?: string|null, now?: Date|number, names?: Map<number,string>|object|((code:number)=>string|undefined) }} caller
 * @returns {{ status: string, message: string, messageHi: string, storeUrl: string, minVersionName: string|null, recommendedVersionName: string|null,
 *             graceUntil: string|null, snoozeDays: number, maintenanceUntil: string|null }}
 */
export function evaluatePolicy(policy, { versionCode, osApi, uid, now = Date.now(), names } = {}) {
  const p = policy && typeof policy === 'object' ? policy : {};
  const t = ms(now) ?? Date.now();
  const vc = intOrNull(versionCode);
  const os = intOrNull(osApi);
  const min = intOrNull(p.minVersionCode);
  const rec = intOrNull(p.recommendedVersionCode);
  const minOs = intOrNull(p.minOsApi);
  const grace = ms(p.graceUntil);
  const maint = p.maintenance && typeof p.maintenance === 'object' ? p.maintenance : {};
  const blocked = Array.isArray(p.blockedVersionCodes) ? p.blockedVersionCodes.map(intOrNull).filter((x) => x !== null) : [];
  const snooze = Number.isInteger(p.snoozeDays) && p.snoozeDays >= 1 && p.snoozeDays <= 30 ? p.snoozeDays : 3;

  const answer = (status, over = {}) => ({
    status,
    message: text(p.message),
    messageHi: text(p.messageHi),
    storeUrl: text(p.storeUrl),
    minVersionName: nameOf(names, min),
    recommendedVersionName: nameOf(names, rec),
    graceUntil: null,
    snoozeDays: snooze,
    maintenanceUntil: null,
    ...over,
  });

  // 1. maintenance: for everyone except an allow-listed user, until the (optional) end time.
  const until = ms(maint.until);
  if (maint.enabled === true && (until === null || t < until) && !(uid && Array.isArray(maint.allowUids) && maint.allowUids.includes(uid))) {
    return answer('maintenance', {
      message: text(maint.message) || text(p.message),
      messageHi: text(maint.messageHi) || text(p.messageHi),
      maintenanceUntil: iso(until),
    });
  }

  // An unidentified build (no / invalid version code) is let through, unless the operator refuses unversioned callers.
  if (vc === null) return answer(p.blockUnversioned === true ? 'update_required' : 'ok');

  // 2. a build the operator blocked by name.
  if (blocked.includes(vc)) return answer('blocked');

  // 3. below the minimum: required once the grace date (if any) has passed; until then a dated nudge.
  if (min !== null && vc < min) {
    if (grace === null || t >= grace) return answer('update_required');
    return answer('update_available', { graceUntil: iso(grace) });
  }

  // 4. an Android version the app will stop supporting: a notice, never a block.
  if (minOs !== null && os !== null && os < minOs) return answer('unsupported_os');

  // 5. behind the recommended build.
  if (rec !== null && vc < rec) return answer('update_available');

  return answer('ok');
}

/** What the public policy endpoint adds to the decision. */
export const policyResponse = (decision, now = Date.now()) => ({ ...decision, serverTime: new Date(ms(now) ?? Date.now()).toISOString() });
