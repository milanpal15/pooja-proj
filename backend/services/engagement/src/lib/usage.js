import { evaluatePolicy, isBlocking } from '@bhakti/common';

import { releaseNames } from './control.js';
import { Visitor } from '../models/index.js';

export const WINDOWS = [7, 30];
const DAY = 864e5;

/** Every device seen in the last 30 days, as light rows. Counted, never invented: `lastSeen` is written by the policy call only. */
async function recentDevices(now) {
  return Visitor.find({ lastSeen: { $gte: new Date(now.getTime() - 30 * DAY) } }).select('versionCode osApi uid lastSeen').lean();
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function byVersionOf(rows, names, now) {
  const since7 = now.getTime() - 7 * DAY;
  const groups = new Map();
  let active7 = 0;
  for (const r of rows) {
    const vc = Number.isInteger(r.versionCode) ? r.versionCode : null;
    const g = groups.get(vc) ?? { versionCode: vc, versionName: vc === null ? null : (names.get(vc) ?? null), devices: 0, activeDevices7d: 0, users7d: new Set() };
    g.devices += 1;
    if (r.lastSeen.getTime() >= since7) {
      g.activeDevices7d += 1;
      active7 += 1;
      if (r.uid) g.users7d.add(r.uid);
    }
    groups.set(vc, g);
  }
  return [...groups.values()]
    .sort((a, b) => (b.versionCode ?? -1) - (a.versionCode ?? -1))
    .map((g) => ({ versionCode: g.versionCode, versionName: g.versionName, devices: g.devices, activeDevices7d: g.activeDevices7d, activeUsers7d: g.users7d.size, pctOfActiveDevices7d: pct(g.activeDevices7d, active7) }));
}

/** `GET /admin/versions/usage`: adoption by build. `total` = devices seen in the last 30 days. */
export async function usageByVersion(now = new Date()) {
  const [rows, names] = await Promise.all([recentDevices(now), releaseNames()]);
  return { byVersion: byVersionOf(rows, names, now), total: rows.length };
}

/**
 * `POST /admin/version-policy/impact`: what a hypothetical policy would do to the devices seen in the last 30 days.
 * Grace and maintenance are left out on purpose - this is the eventual effect of the numbers, not today's.
 * @param {object} hypothetical  a full policy field set (lib/policy.js `fieldsOf` shape)
 */
export async function impactOf(hypothetical, now = new Date()) {
  const [rows, names] = await Promise.all([recentDevices(now), releaseNames()]);
  const policy = { ...hypothetical, graceUntil: null, maintenance: { ...hypothetical.maintenance, enabled: false } };
  const since7 = now.getTime() - 7 * DAY;
  const devices = { total: rows.length, blocked: 0, nudged: 0, unsupportedOs: 0 };
  const users7 = new Set();
  const users30 = new Set();
  const verdict = new Map(); // `${vc}|${os}` -> status
  for (const r of rows) {
    const key = `${r.versionCode ?? ''}|${r.osApi ?? ''}`;
    if (!verdict.has(key)) verdict.set(key, evaluatePolicy(policy, { versionCode: r.versionCode, osApi: r.osApi, now, names }).status);
    const status = verdict.get(key);
    if (isBlocking(status)) {
      devices.blocked += 1;
      if (r.uid) {
        users30.add(r.uid);
        if (r.lastSeen.getTime() >= since7) users7.add(r.uid);
      }
    } else if (status === 'update_available') devices.nudged += 1;
    else if (status === 'unsupported_os') devices.unsupportedOs += 1;
  }
  return { devices, users: { blockedActive7d: users7.size, blockedActive30d: users30.size }, activeWindowDays: WINDOWS, byVersion: byVersionOf(rows, names, now) };
}
