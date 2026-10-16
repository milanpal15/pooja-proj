/** The 360 tabs and how each fan-out section reads (docs/USERS.md §2: `{unavailable:true, reason}` for a section that timed out). */
export const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'devices', label: 'Devices' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'events', label: 'Events' },
  { id: 'calls', label: 'Calls' },
  { id: 'activity', label: 'Activity' },
  { id: 'notes', label: 'Notes & tags' },
];
export const TAB_IDS = TABS.map((t) => t.id);

/** The tabs backed by another service. Profile, Devices, Activity and Notes come from identity itself. */
export const FANOUT = ['wallet', 'bookings', 'events', 'calls'];

export const isUnavailable = (section) => !!section && section.unavailable === true;

const arr = (v) => (Array.isArray(v) ? v : []);

/** The rows a tab would list, for the empty test. */
function rowsOf(detail, tab) {
  switch (tab) {
    case 'devices':
      return arr(detail.devices);
    case 'wallet':
      return arr(detail.wallet?.recent);
    case 'bookings':
      return arr(detail.bookings?.recent);
    case 'events':
      return [...arr(detail.events?.registrations), ...arr(detail.events?.badges)];
    case 'calls':
      return arr(detail.calls?.recent);
    case 'activity':
      return [...arr(detail.user?.blockHistory), ...arr(detail.audit)];
    case 'notes':
      return [...arr(detail.user?.notes), ...arr(detail.user?.tags)];
    default:
      return [1];
  }
}

/**
 * 'unavailable' (that service did not answer — offer Retry) | 'empty' | 'ready'.
 * A missing section on a fan-out tab is treated as unavailable: better to offer a retry than to claim "no bookings".
 */
export function tabState(detail, tab) {
  if (!detail) return 'loading';
  if (FANOUT.includes(tab)) {
    const section = detail[tab];
    if (section == null || isUnavailable(section)) return 'unavailable';
  }
  return rowsOf(detail, tab).length ? 'ready' : 'empty';
}

/** A short count for the tab label; undefined when there is nothing honest to show (unavailable). */
export function tabCount(detail, tab) {
  if (!detail) return undefined;
  switch (tab) {
    case 'devices':
      return arr(detail.devices).length;
    case 'wallet':
      return isUnavailable(detail.wallet) || detail.wallet == null ? undefined : detail.wallet.balance;
    case 'bookings':
      return isUnavailable(detail.bookings) || detail.bookings == null ? undefined : detail.bookings.total;
    case 'calls':
      return isUnavailable(detail.calls) || detail.calls == null ? undefined : detail.calls.total;
    case 'events':
      return isUnavailable(detail.events) || detail.events == null ? undefined : arr(detail.events.registrations).length;
    case 'notes':
      return arr(detail.user?.notes).length || undefined;
    default:
      return undefined;
  }
}

export const unavailableTabs = (detail) => FANOUT.filter((t) => tabState(detail, t) === 'unavailable');

/** What the operator types to confirm a delete: the contact, or the last six characters of the uid when the contact is masked. */
export const isMasked = (text) => /[•*]/.test(String(text ?? ''));
export function deleteTargets(user) {
  const out = [];
  if (user?.contact && !isMasked(user.contact)) out.push(String(user.contact));
  if (user?.uid) out.push(String(user.uid).slice(-6));
  return out;
}
export const deleteMatches = (input, user) => {
  const t = String(input ?? '').trim().toLowerCase();
  return t !== '' && deleteTargets(user).some((x) => x.toLowerCase() === t);
};
/** The phrase to show in the prompt. */
export const deletePhrase = (user) => deleteTargets(user)[0] ?? '';

/** "Devices (2)", "Wallet (1,461)"; the plain label when a count would be dishonest (the service did not answer). */
export function tabLabel(detail, tab) {
  const base = TABS.find((t) => t.id === tab)?.label ?? tab;
  const n = tabCount(detail, tab);
  return n == null ? base : `${base} (${Number(n).toLocaleString('en-IN')})`;
}
