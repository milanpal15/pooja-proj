/** Deep links that open the phone's maps app at a destination. Pure; tested in directions.test.mjs. */

export type Destination = { lat: number; lng: number; name?: string | null };

/** `encodeURIComponent` leaves ( ) ! ' * alone; the Android geo: label uses parentheses, so encode them too. */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[()!'*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const pos = (d: Destination) => `${d.lat.toFixed(6)},${d.lng.toFixed(6)}`;

/**
 * URLs to try, best first. Android: a `geo:` URI (any maps app handles it; the label pins the name),
 * then Google's web directions. iOS: Apple Maps, then the same web fallback.
 */
export function directionsUrls(d: Destination, os: string): string[] {
  const name = d.name?.trim();
  const web = `https://www.google.com/maps/dir/?api=1&destination=${pos(d)}`;
  if (os === 'ios') {
    return [`https://maps.apple.com/?daddr=${pos(d)}${name ? `&q=${enc(name)}` : ''}`, web];
  }
  return [`geo:${pos(d)}?q=${pos(d)}${name ? `(${enc(name)})` : ''}`, web];
}
