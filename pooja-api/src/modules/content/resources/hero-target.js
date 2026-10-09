export const TARGET_TYPES = ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'link', 'none'];

/**
 * Resolve a slide target to the in-app route (or https URL) it opens.
 * Returns '' when it leads nowhere, and for a `link` that is not https.
 * docs/POOJA_AND_HOME.md 1b.
 */
export function heroHref(target) {
  const type = target?.type;
  const ref = typeof target?.ref === 'string' ? target.ref.trim() : '';
  switch (type) {
    case 'pooja': return ref ? `/pooja/${encodeURIComponent(ref)}` : '';
    case 'chadhava': return ref ? `/chadhava/${encodeURIComponent(ref)}` : '';
    case 'temple': return ref ? `/poojas?temple=${encodeURIComponent(ref)}` : '';
    case 'bhajan': return '/bhajan';
    case 'astrologer': return '/astrologers';
    case 'coins': return '/wallet';
    case 'link':
      try { return new URL(ref).protocol === 'https:' ? ref : ''; } catch { return ''; }
    default: return '';
  }
}
