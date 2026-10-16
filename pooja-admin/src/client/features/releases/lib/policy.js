import { isoToLocalInput, localInputToIso } from '../../../lib/dates.js';

/**
 * The version-policy form (docs/RELEASES.md §2, §5). Text boxes hold strings; `toBody` turns them into the API's
 * integers / ISO dates, `validate` repeats the server's rules so a mistake shows next to its field before any request,
 * and `riskReasons` repeats the server's "risky" test so the button can say "Request approval" in advance.
 * The server stays the authority: it may still answer 400 (fields) or 202 (sent for approval).
 */

export const MAX_MESSAGE = 300;
export const MAX_BLOCKED = 50;
export const MAX_UIDS = 50;

export const blankForm = () => ({
  minVersionCode: '',
  recommendedVersionCode: '',
  blockedVersionCodes: [],
  minOsApi: '',
  graceUntil: '',
  snoozeDays: '3',
  message: '',
  messageHi: '',
  storeUrl: '',
  blockUnversioned: false,
  maintenance: { enabled: false, message: '', messageHi: '', until: '', allowUids: [] },
});

const num = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

export function fromPolicy(p) {
  const b = blankForm();
  if (!p) return b;
  const m = p.maintenance || {};
  return {
    minVersionCode: num(p.minVersionCode),
    recommendedVersionCode: num(p.recommendedVersionCode),
    blockedVersionCodes: [...(p.blockedVersionCodes || [])].map(Number).sort((a, c) => a - c),
    minOsApi: num(p.minOsApi),
    graceUntil: isoToLocalInput(p.graceUntil),
    snoozeDays: num(p.snoozeDays ?? 3),
    message: p.message || '',
    messageHi: p.messageHi || '',
    storeUrl: p.storeUrl || '',
    blockUnversioned: !!p.blockUnversioned,
    maintenance: {
      enabled: !!m.enabled,
      message: m.message || '',
      messageHi: m.messageHi || '',
      until: isoToLocalInput(m.until),
      allowUids: [...(m.allowUids || [])],
    },
  };
}

const isInt = (s) => /^\d+$/.test(String(s).trim());
const toInt = (s) => (String(s).trim() === '' ? null : Number(String(s).trim()));

/** The PUT /version-policy body. Assumes `validate` passed (an unreadable number becomes null). */
export function toBody(f) {
  return {
    minVersionCode: isInt(f.minVersionCode) ? toInt(f.minVersionCode) : null,
    recommendedVersionCode: isInt(f.recommendedVersionCode) ? toInt(f.recommendedVersionCode) : null,
    blockedVersionCodes: [...new Set(f.blockedVersionCodes.map(Number))].sort((a, c) => a - c),
    minOsApi: isInt(f.minOsApi) ? toInt(f.minOsApi) : null,
    graceUntil: localInputToIso(f.graceUntil),
    snoozeDays: isInt(f.snoozeDays) ? toInt(f.snoozeDays) : 3,
    message: f.message.trim(),
    messageHi: f.messageHi.trim(),
    storeUrl: f.storeUrl.trim(),
    blockUnversioned: !!f.blockUnversioned,
    maintenance: {
      enabled: !!f.maintenance.enabled,
      message: f.maintenance.message.trim(),
      messageHi: f.maintenance.messageHi.trim(),
      until: localInputToIso(f.maintenance.until),
      allowUids: f.maintenance.allowUids.map((u) => u.trim()).filter(Boolean),
    },
  };
}

/** @returns {Record<string,string>} field -> message; empty when the form is acceptable. Keys match `toBody`, `maintenance.x` nested. */
export function validate(f) {
  const e = {};
  const intField = (key, label) => {
    const v = String(f[key]).trim();
    if (v !== '' && !isInt(v)) e[key] = `${label} must be a whole number, 0 or more.`;
  };
  intField('minVersionCode', 'Minimum build');
  intField('recommendedVersionCode', 'Recommended build');
  intField('minOsApi', 'Android API level');
  if (!e.minVersionCode && !e.recommendedVersionCode && f.minVersionCode.trim() !== '' && f.recommendedVersionCode.trim() !== '' && toInt(f.recommendedVersionCode) < toInt(f.minVersionCode)) {
    e.recommendedVersionCode = 'Recommended build cannot be lower than the minimum.';
  }
  if (f.blockedVersionCodes.length > MAX_BLOCKED) e.blockedVersionCodes = `At most ${MAX_BLOCKED} blocked builds.`;
  if (f.blockedVersionCodes.some((c) => !Number.isInteger(c) || c < 0)) e.blockedVersionCodes = 'Blocked builds are whole numbers, 0 or more.';
  const sd = String(f.snoozeDays).trim();
  if (!isInt(sd) || toInt(sd) < 1 || toInt(sd) > 30) e.snoozeDays = 'Remind again after 1 to 30 days.';
  if (f.graceUntil && !localInputToIso(f.graceUntil)) e.graceUntil = 'That date and time is not valid.';
  for (const k of ['message', 'messageHi']) if (f[k].length > MAX_MESSAGE) e[k] = `At most ${MAX_MESSAGE} characters (${f[k].length}).`;
  if (f.storeUrl.trim() && !/^https?:\/\/\S+$/i.test(f.storeUrl.trim())) e.storeUrl = 'Use a full link starting with https://';
  const m = f.maintenance;
  for (const k of ['message', 'messageHi']) if (m[k].length > MAX_MESSAGE) e[`maintenance.${k}`] = `At most ${MAX_MESSAGE} characters (${m[k].length}).`;
  if (m.until && !localInputToIso(m.until)) e['maintenance.until'] = 'That date and time is not valid.';
  if (m.allowUids.length > MAX_UIDS) e['maintenance.allowUids'] = `At most ${MAX_UIDS} people.`;
  return e;
}

/** The server's 400 bad_policy `fields` (object or list of { field, message }) as the same key -> message map. */
export function serverFields(body) {
  const f = body?.fields;
  if (!f) return {};
  if (Array.isArray(f)) return Object.fromEntries(f.map((x) => [x.field ?? x.path ?? '', x.message ?? x.error ?? 'Not accepted']));
  return { ...f };
}

const cmp = (x, y) => (x ?? null) === (y ?? null);

/**
 * Why a change can lock people out (docs/RELEASES.md §5): minimum raised, a build added to the blocked list, maintenance
 * turned on, "block unversioned" turned on, or the grace date brought earlier. `before` is the saved policy object,
 * `after` the body that would be sent. Empty = relief or cosmetic: it applies at once.
 */
export function riskReasons(before, after) {
  const b = before || {};
  const out = [];
  if (after.minVersionCode != null && (b.minVersionCode == null || after.minVersionCode > b.minVersionCode)) out.push('raises the minimum build');
  const had = new Set(b.blockedVersionCodes || []);
  const added = (after.blockedVersionCodes || []).filter((c) => !had.has(c));
  if (added.length) out.push(`blocks build${added.length > 1 ? 's' : ''} ${added.join(', ')}`);
  if (after.maintenance?.enabled && !b.maintenance?.enabled) out.push('turns maintenance on');
  if (after.blockUnversioned && !b.blockUnversioned) out.push('blocks callers that send no version');
  const bg = b.graceUntil ? Date.parse(b.graceUntil) : null;
  const ag = after.graceUntil ? Date.parse(after.graceUntil) : null;
  if (bg != null && (ag == null || ag < bg)) out.push('brings the grace date earlier');
  return out;
}

/** Has the operator changed anything? Compares what would be sent. */
export function isDirty(form, baseline) {
  return JSON.stringify(toBody(form)) !== JSON.stringify(toBody(baseline));
}

export { cmp };
