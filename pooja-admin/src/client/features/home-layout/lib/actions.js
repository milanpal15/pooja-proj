/**
 * How an Action's `ref` is entered, by ACTION type (docs/HOME_LAYOUT.md §1). This is
 * the one small table the picker needs: some actions point at a catalogue the
 * dashboard already has, some take typed text, some take no ref at all. The
 * list of action types itself comes from the registry.
 */
export const REF_KIND = {
  pooja: 'poojas',
  chadhava: 'listings',
  temple: 'temples',
  event: 'events',
  live: 'text',
  route: 'text',
  link: 'text',
};
export const REF_HINT = {
  live: 'A stream slug, or blank for the live-darshan list.',
  route: 'An in-app path starting with /, e.g. /poojas',
  link: 'An https:// address',
};
export const REF_PLACEHOLDER = { live: 'optional', route: '/poojas', link: 'https://' };

const NO_REF = ['none', 'bhajan', 'astrologer', 'coins', 'events', 'panchang', 'horoscope'];
/** How the ref is entered: a catalogue name, 'text', or 'none'. An action type this table does not know (a newer registry) gets an optional text ref. */
export const refKind = (type) => (!type || NO_REF.includes(type) ? 'none' : REF_KIND[type] ?? 'text');
export const takesRef = (type) => refKind(type) !== 'none';

/** A one-line description for the preview chip / list: "pooja → kashi-aarti". */
export const actionLabel = (a) => (!a || !a.type || a.type === 'none' ? '' : a.ref ? `${a.type} → ${a.ref}` : a.type);
