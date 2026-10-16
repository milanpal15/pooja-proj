export { formatDistance as formatPlaceDistance } from '../../../components/map/distance';

/** Text for the map: distances and language-aware names. Pure; tested in format.test.mjs. */

export type MapLang = 'en' | 'hi' | null | undefined;

/** The Hindi name when the app is in Hindi and OSM has one; otherwise the plain name. */
export function placeName(p: { name: string; nameHi?: string | null }, lang: MapLang): string {
  const hi = p.nameHi?.trim();
  return lang === 'hi' && hi ? hi : p.name;
}
