import { blockView, historyView, isBlocked } from './blocks.js';

/**
 * How a User row is shown to an operator (docs/USERS.md section 2). `now` decides what "blocked" means; masking is applied by the caller
 * (lib/redact.js) because it depends on who is asking.
 */
const iso = (d) => (d ? new Date(d).toISOString() : null);

/** The newest device (by lastSeen) for each uid. */
export function latestDeviceByUid(devices) {
  const map = new Map();
  for (const d of devices ?? []) {
    if (!d?.uid) continue;
    const had = map.get(d.uid);
    if (!had || new Date(d.lastSeen ?? 0) > new Date(had.lastSeen ?? 0)) map.set(d.uid, d);
  }
  return map;
}

/** One line of the list. `device`: the registry row for this account's newest device (or undefined). */
export function userRow(u, { now = new Date(), device, hasPush = false } = {}) {
  const blocked = isBlocked(u, now);
  return {
    id: String(u._id),
    uid: u.uid ?? null,
    name: u.name || '',
    contact: u.contact || '',
    method: u.method || null,
    role: u.role === 'astrologer' ? 'astrologer' : 'devotee',
    blocked,
    blockUntil: blocked && u.block?.until ? iso(u.block.until) : null,
    tags: u.tags ?? [],
    lastActive: iso(u.lastActive),
    createdAt: iso(u.createdAt),
    ...(device ? { versionName: device.versionName ?? null, versionCode: device.versionCode ?? null } : {}),
    hasPush: !!hasPush,
  };
}

/** The profile block of the 360 view. */
export function userProfile(u, { now = new Date() } = {}) {
  const accepted = u.acceptedPolicies instanceof Map ? Object.fromEntries(u.acceptedPolicies) : (u.acceptedPolicies ?? {});
  return {
    ...userRow(u, { now }),
    phone: u.phone || null,
    email: u.email || null,
    emailVerified: !!u.emailVerified,
    photoUrl: u.photoUrl || null,
    bio: u.bio || '',
    gender: u.gender || null,
    dob: u.dob || null,
    savedTemples: (u.savedTemples ?? []).length,
    acceptedPolicies: accepted,
    block: blockView(u, now),
    blockHistory: historyView(u),
    notes: (u.notes ?? []).map((n) => ({ id: n.id, text: n.text, by: n.by, at: iso(n.at) })),
  };
}
