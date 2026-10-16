import { intOrNull } from '@bhakti/common';

/**
 * The version policy as plain JSON, its validation and the "is this change risky?" rule (docs/RELEASES.md sections 2 and 5).
 * Pure: no database, no clock.
 */

export const PLATFORMS = ['android'];
export const MAX_BLOCKED = 50;
export const MAX_ALLOW_UIDS = 50;
export const MAX_MESSAGE = 300;

const iso = (d) => {
  if (d === null || d === undefined || d === '') return null;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** The policy fields an operator can change, in a canonical shape (dates as ISO strings, lists sorted). `version`, `platform`, timestamps are not fields. */
export function fieldsOf(doc) {
  const d = doc?.toObject ? doc.toObject() : (doc ?? {});
  const m = d.maintenance ?? {};
  return {
    minVersionCode: intOrNull(d.minVersionCode),
    recommendedVersionCode: intOrNull(d.recommendedVersionCode),
    blockedVersionCodes: [...new Set((d.blockedVersionCodes ?? []).map(intOrNull).filter((x) => x !== null))].sort((a, b) => a - b),
    minOsApi: intOrNull(d.minOsApi),
    graceUntil: iso(d.graceUntil),
    snoozeDays: Number.isInteger(d.snoozeDays) ? d.snoozeDays : 3,
    message: d.message ?? '',
    messageHi: d.messageHi ?? '',
    storeUrl: d.storeUrl ?? '',
    maintenance: {
      enabled: m.enabled === true,
      message: m.message ?? '',
      messageHi: m.messageHi ?? '',
      until: iso(m.until),
      allowUids: [...(m.allowUids ?? [])].sort(),
    },
    blockUnversioned: d.blockUnversioned === true,
  };
}

export const sameFields = (a, b) => JSON.stringify(fieldsOf(a)) === JSON.stringify(fieldsOf(b));

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The operator's JSON merged over the current policy, validated.
 * @returns {{ ok: true, fields: object } | { ok: false, fields: Record<string,string> }}   (the failure's `fields` is `{ fieldName: message }`)
 */
export function mergeAndValidate(current, body) {
  const cur = fieldsOf(current);
  const b = isObj(body) ? body : {};
  const errors = {};
  const out = { ...cur, maintenance: { ...cur.maintenance } };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  const intField = (key, target, path = key) => {
    if (!has(target.src, key)) return;
    const v = target.src[key];
    if (v === null || v === '') target.dst[key] = null;
    else if (intOrNull(v) !== null && typeof v === 'number') target.dst[key] = v;
    else errors[path] = 'Must be a whole number, 0 or more (or empty).';
  };
  const textField = (key, target, path = key) => {
    if (!has(target.src, key)) return;
    const v = target.src[key];
    if (v === null || v === undefined) target.dst[key] = '';
    else if (typeof v !== 'string') errors[path] = 'Must be text.';
    else if (v.trim().length > MAX_MESSAGE) errors[path] = `At most ${MAX_MESSAGE} characters.`;
    else target.dst[key] = v.trim();
  };
  const dateField = (key, target, path = key) => {
    if (!has(target.src, key)) return;
    const v = target.src[key];
    if (v === null || v === '') target.dst[key] = null;
    else if (typeof v === 'string' && iso(v)) target.dst[key] = iso(v);
    else errors[path] = 'Must be a valid date and time (or empty).';
  };
  const top = { src: b, dst: out };

  intField('minVersionCode', top);
  intField('recommendedVersionCode', top);
  intField('minOsApi', top);
  dateField('graceUntil', top);
  textField('message', top);
  textField('messageHi', top);

  if (has(b, 'snoozeDays')) {
    if (Number.isInteger(b.snoozeDays) && b.snoozeDays >= 1 && b.snoozeDays <= 30) out.snoozeDays = b.snoozeDays;
    else errors.snoozeDays = 'Must be a whole number from 1 to 30.';
  }
  if (has(b, 'storeUrl')) {
    const v = b.storeUrl ?? '';
    if (typeof v !== 'string' || v.length > 500 || (v.trim() && !/^(https?:\/\/|market:\/\/)\S+$/i.test(v.trim()))) errors.storeUrl = 'Must be an http(s) or market:// link, at most 500 characters (or empty).';
    else out.storeUrl = v.trim();
  }
  if (has(b, 'blockUnversioned')) {
    if (typeof b.blockUnversioned === 'boolean') out.blockUnversioned = b.blockUnversioned;
    else errors.blockUnversioned = 'Must be true or false.';
  }
  if (has(b, 'blockedVersionCodes')) {
    const list = b.blockedVersionCodes;
    if (!Array.isArray(list) || list.some((x) => typeof x !== 'number' || intOrNull(x) === null)) errors.blockedVersionCodes = 'Must be a list of whole version codes, 0 or more.';
    else if (list.length > MAX_BLOCKED) errors.blockedVersionCodes = `At most ${MAX_BLOCKED} blocked builds.`;
    else out.blockedVersionCodes = [...new Set(list)].sort((x, y) => x - y);
  }

  if (has(b, 'maintenance')) {
    const m = b.maintenance;
    if (!isObj(m)) errors.maintenance = 'Must be an object.';
    else {
      const mt = { src: m, dst: out.maintenance };
      if (has(m, 'enabled')) {
        if (typeof m.enabled === 'boolean') out.maintenance.enabled = m.enabled;
        else errors['maintenance.enabled'] = 'Must be true or false.';
      }
      textField('message', mt, 'maintenance.message');
      textField('messageHi', mt, 'maintenance.messageHi');
      dateField('until', mt, 'maintenance.until');
      if (has(m, 'allowUids')) {
        const l = m.allowUids;
        if (!Array.isArray(l) || l.some((x) => typeof x !== 'string' || !x.trim() || x.length > 128)) errors['maintenance.allowUids'] = 'Must be a list of user ids (text, at most 128 characters each).';
        else if (new Set(l.map((x) => x.trim())).size > MAX_ALLOW_UIDS) errors['maintenance.allowUids'] = `At most ${MAX_ALLOW_UIDS} people on the allow-list.`;
        else out.maintenance.allowUids = [...new Set(l.map((x) => x.trim()))].sort();
      }
    }
  }

  if (!errors.minVersionCode && !errors.recommendedVersionCode && out.minVersionCode !== null && out.recommendedVersionCode !== null && out.recommendedVersionCode < out.minVersionCode) {
    errors.recommendedVersionCode = 'The recommended build cannot be older than the minimum.';
  }
  return Object.keys(errors).length ? { ok: false, fields: errors } : { ok: true, fields: out };
}

/**
 * Can this change lock somebody out? (docs/RELEASES.md section 5.) Relief and cosmetic edits are never risky.
 *   - the minimum is raised (a minimum appears, or goes up)
 *   - a build is added to the blocked list
 *   - maintenance is turned on
 *   - `blockUnversioned` is turned on
 *   - the grace date is brought earlier (or removed, which ends the grace at once)
 */
export function isRisky(before, after) {
  const b = fieldsOf(before);
  const a = fieldsOf(after);
  if (a.minVersionCode !== null && (b.minVersionCode === null || a.minVersionCode > b.minVersionCode)) return true;
  if (a.blockedVersionCodes.some((c) => !b.blockedVersionCodes.includes(c))) return true;
  if (!b.maintenance.enabled && a.maintenance.enabled) return true;
  if (!b.blockUnversioned && a.blockUnversioned) return true;
  if (b.graceUntil !== null && (a.graceUntil === null || Date.parse(a.graceUntil) < Date.parse(b.graceUntil))) return true;
  return false;
}

/** A short human sentence per difference, for the approvals queue and the audit trail. */
export function describeChange(before, after) {
  const b = fieldsOf(before);
  const a = fieldsOf(after);
  const out = [];
  const show = (v) => (v === null || v === '' ? 'none' : v);
  if (a.minVersionCode !== b.minVersionCode) out.push(`minimum build ${show(b.minVersionCode)} -> ${show(a.minVersionCode)}`);
  if (a.recommendedVersionCode !== b.recommendedVersionCode) out.push(`recommended build ${show(b.recommendedVersionCode)} -> ${show(a.recommendedVersionCode)}`);
  for (const c of a.blockedVersionCodes.filter((x) => !b.blockedVersionCodes.includes(x))) out.push(`block build ${c}`);
  for (const c of b.blockedVersionCodes.filter((x) => !a.blockedVersionCodes.includes(x))) out.push(`unblock build ${c}`);
  if (a.minOsApi !== b.minOsApi) out.push(`minimum Android API ${show(b.minOsApi)} -> ${show(a.minOsApi)}`);
  if (a.graceUntil !== b.graceUntil) out.push(`grace until ${show(b.graceUntil)} -> ${show(a.graceUntil)}`);
  if (a.maintenance.enabled !== b.maintenance.enabled) out.push(`maintenance ${a.maintenance.enabled ? 'ON' : 'OFF'}`);
  else if (JSON.stringify(a.maintenance) !== JSON.stringify(b.maintenance)) out.push('maintenance details');
  if (a.blockUnversioned !== b.blockUnversioned) out.push(`refuse unversioned callers ${a.blockUnversioned ? 'ON' : 'OFF'}`);
  if (a.snoozeDays !== b.snoozeDays) out.push(`snooze ${b.snoozeDays} -> ${a.snoozeDays} days`);
  if (a.message !== b.message || a.messageHi !== b.messageHi) out.push('update message');
  if (a.storeUrl !== b.storeUrl) out.push('store link');
  return out;
}

/** The audit trail keeps counts, not the allow-listed people. */
export function auditFields(doc) {
  const f = fieldsOf(doc);
  const { allowUids, ...maintenance } = f.maintenance;
  return { ...f, maintenance: { ...maintenance, allowUidsCount: allowUids.length } };
}

/** IST (UTC+5:30) calendar day, `YYYY-MM-DD`. */
export const istDay = (t = Date.now()) => new Date(Number(t) + 5.5 * 3600_000).toISOString().slice(0, 10);
