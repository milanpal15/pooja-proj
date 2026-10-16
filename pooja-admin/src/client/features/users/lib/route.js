import { TAB_IDS } from './detail.js';

/**
 * `#/people/users[/<id>|/blocked-devices][?tab=…&page=1]` -> what the Users page should show.
 *  - no segment: the list
 *  - `blocked-devices`: the device block list (a child route, lib/nav/registry.js)
 *  - an id: that user's 360. It is a right-hand drawer over the list when the operator came from the list, and a
 *    full page on a deep link or when `?page=1` is set. `arrivedWithId` is whether the page mounted on that URL.
 */
export const BLOCKED_DEVICES = 'blocked-devices';

export function parseUsersRoute(rest = [], query = {}, { arrivedWithId = false } = {}) {
  const seg = rest[0];
  if (!seg) return { view: 'list' };
  if (seg === BLOCKED_DEVICES) return { view: 'devices' };
  const tab = TAB_IDS.includes(query.tab) ? query.tab : 'profile';
  return { view: 'detail', id: seg, tab, mode: arrivedWithId || query.page === '1' ? 'page' : 'drawer' };
}

/** Hashes for the links the page builds. */
export const userHash = (id, { tab, page } = {}) => {
  const q = [tab && tab !== 'profile' ? `tab=${tab}` : '', page ? 'page=1' : ''].filter(Boolean).join('&');
  return `#/people/users/${encodeURIComponent(id)}${q ? `?${q}` : ''}`;
};
export const LIST_HASH = '#/people/users';
export const DEVICES_HASH = `#/people/users/${BLOCKED_DEVICES}`;
