import { computePanchang, DEFAULT_PLACE } from '@/lib/panchang';

/**
 * The real panchang for today.
 *
 * This banner printed a fixed string — '॥ सोमवार, आषाढ़, त्रयोदशी ॥' —
 * under the murti on every screen, every day, regardless of the date. It
 * is computed on device from the same library the Panchang screen uses,
 * so the two can no longer disagree.
 */
export function panchangLine(): string {
  try {
    const p = computePanchang(new Date(), DEFAULT_PLACE.lat, DEFAULT_PLACE.lng);
    return `॥ ${p.varaHi}, ${p.masaHi}, ${p.tithiHi} ॥`;
  } catch {
    // An ephemeris failure must not take the sanctum down; drop the line.
    return '';
  }
}
