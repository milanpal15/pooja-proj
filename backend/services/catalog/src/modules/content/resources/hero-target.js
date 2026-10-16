export const TARGET_TYPES = ['pooja', 'chadhava', 'temple', 'bhajan', 'astrologer', 'coins', 'event', 'events', 'live', 'panchang', 'horoscope', 'route', 'link', 'none'];

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
    // Also the Home layout v2 actions (docs/HOME_LAYOUT.md section 1); slider banners may use them too.
    case 'event': return ref ? `/events/${encodeURIComponent(ref)}` : '';
    case 'events': return '/events';
    case 'live': return ref ? `/darshan/${encodeURIComponent(ref)}` : '/darshan';
    case 'panchang': return '/panchang';
    case 'horoscope': return '/horoscope';
    case 'route': return ref.startsWith('/') && !ref.startsWith('//') ? ref : '';
    case 'link':
      try { return new URL(ref).protocol === 'https:' ? ref : ''; } catch { return ''; }
    default: return '';
  }
}
