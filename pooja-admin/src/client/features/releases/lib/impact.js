import { isoToLocalInput } from '../../../lib/dates.js';

/** The hypothetical sent to POST /version-policy/impact, or null while a number box holds something unreadable. */
export function impactBody(form) {
  const int = (s) => (String(s).trim() === '' ? null : /^\d+$/.test(String(s).trim()) ? Number(String(s).trim()) : NaN);
  const body = {
    minVersionCode: int(form.minVersionCode),
    recommendedVersionCode: int(form.recommendedVersionCode),
    blockedVersionCodes: form.blockedVersionCodes,
    minOsApi: int(form.minOsApi),
  };
  if ([body.minVersionCode, body.recommendedVersionCode, body.minOsApi].some(Number.isNaN)) return null;
  return body;
}

/** How a build fares under a hypothetical policy. */
export function classify(code, hyp) {
  if ((hyp.blockedVersionCodes || []).includes(code)) return 'blocked';
  if (hyp.minVersionCode != null && code < hyp.minVersionCode) return 'below_min';
  if (hyp.recommendedVersionCode != null && code < hyp.recommendedVersionCode) return 'nudged';
  return 'ok';
}

export const STATE_LABEL = { blocked: 'Blocked build', below_min: 'Below minimum', nudged: 'Update nudge', ok: 'Supported' };

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 10) / 10}%` : '—');

/**
 * `impact.byVersion` (or /versions/usage) -> bars, newest build first. Bar length is installed devices; the label also
 * carries the server's share of devices active in the last 7 days. Nothing is computed here that the server did not send,
 * except the classification, which is the same rule as the gate (blocked list, then minimum, then recommended).
 */
export function chartModel(byVersion, hyp) {
  const list = [...(byVersion || [])].sort((a, b) => b.versionCode - a.versionCode);
  const max = Math.max(1, ...list.map((v) => v.devices || 0));
  return {
    max,
    rows: list.map((v) => {
      const state = classify(v.versionCode, hyp);
      return {
        code: v.versionCode,
        label: v.versionName ? `${v.versionName} (${v.versionCode})` : `build ${v.versionCode}`,
        devices: v.devices || 0,
        active7d: v.activeDevices7d ?? null,
        pct: pct(v.pctOfActiveDevices7d),
        share: (v.devices || 0) / max,
        state,
        stateLabel: STATE_LABEL[state],
      };
    }),
  };
}

const n = (x) => (x == null ? '—' : Number(x).toLocaleString('en-IN'));

/** "blocks 412 devices · 305 users active in 7d" (null until the server has answered). */
export function headline(impact) {
  if (!impact?.devices) return null;
  const d = impact.devices;
  const u = impact.users || {};
  return {
    blocks: `blocks ${n(d.blocked)} device${d.blocked === 1 ? '' : 's'} · ${n(u.blockedActive7d)} user${u.blockedActive7d === 1 ? '' : 's'} active in 7d`,
    nudges: `nudges ${n(d.nudged)} device${d.nudged === 1 ? '' : 's'}`,
    os: d.unsupportedOs ? `${n(d.unsupportedOs)} on an unsupported Android` : '',
    thirty: `${n(u.blockedActive30d)} active in 30d`,
    total: `${n(d.total)} devices seen`,
  };
}

/** Rough "is this the same as the saved policy" so the preview can say "no change". */
export const sameImpactBody = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export { isoToLocalInput };
