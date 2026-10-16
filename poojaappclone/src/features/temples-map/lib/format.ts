/** Text for the map: distances and language-aware names. Pure; tested in format.test.mjs. */

export type MapLang = 'en' | 'hi' | null | undefined;

/** "350 m", "1.2 km", "14 km" — 10 m resolution under a kilometre, whole km from ten up. */
export function formatPlaceDistance(metres: number, lang: MapLang = 'en'): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  const unit = lang === 'hi' ? { m: 'मी', km: 'कि.मी.' } : { m: 'm', km: 'km' };
  const m = metres < 1000 ? Math.round(metres / 10) * 10 : metres;
  if (m < 1000) return `${Math.max(10, m)} ${unit.m}`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} ${unit.km}` : `${Math.round(km)} ${unit.km}`;
}

/** The Hindi name when the app is in Hindi and OSM has one; otherwise the plain name. */
export function placeName(p: { name: string; nameHi?: string | null }, lang: MapLang): string {
  const hi = p.nameHi?.trim();
  return lang === 'hi' && hi ? hi : p.name;
}
