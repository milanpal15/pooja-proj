import { formatAgo } from '../../../lib/dates.js';

const STALE_MS = 45000; // matches the public API: no heartbeat for 45 s means offline

/** The presence a row really has: an "online" nobody has heard from is offline. */
function effectivePresence(a) {
  if (a.status !== 'active') return 'offline';
  if (a.presence === 'busy') return 'busy';
  if (a.presence === 'online') {
    const seen = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : null;
    if (seen !== null && Date.now() - seen > STALE_MS) return 'offline';
    return 'online';
  }
  return 'offline';
}

/** Presence badge: { label, tone }. Status wins over presence. */
export function presenceView(a) {
  if (a.status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  if (a.status === 'invited') return { label: 'Invited · not signed in', tone: 'warning' };
  const p = effectivePresence(a);
  if (p === 'busy') return { label: 'On a call', tone: 'warning' };
  if (p === 'online') return { label: 'Online', tone: 'success' };
  return { label: 'Offline', tone: 'outline' };
}

/** The status line in the edit modal. */
export function statusLine(a) {
  if (!a) return { label: 'Invited · not signed in yet', tone: 'warning' };
  if (a.status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  if (a.status === 'invited') return { label: 'Invited · not signed in yet', tone: 'warning' };
  const when = formatAgo(a.lastSignInAt);
  return { label: when ? `Signed in · ${when}` : 'Signed in', tone: 'success' };
}

/** Counts for the live strip. */
export function liveCounts(rows) {
  const c = { online: 0, busy: 0, active: 0, invited: 0, total: rows.length };
  rows.forEach((a) => {
    if (a.status === 'active') c.active += 1;
    if (a.status === 'invited') c.invited += 1;
    const p = effectivePresence(a);
    if (p === 'online') c.online += 1;
    if (p === 'busy') c.busy += 1;
  });
  return c;
}
