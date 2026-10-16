/** A tiny event so the header bell refetches right after the Approvals page (or a save that created a request) changes something. */
const EVENT = 'bhakti:approvals-changed';
export const notifyApprovalsChanged = () => window.dispatchEvent(new Event(EVENT));
export function onApprovalsChanged(fn) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
