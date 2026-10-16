/** "350 m", "1.2 km", "14 km" — 10 m resolution under a kilometre, whole km from ten up. Pure; tested in distance.test.mjs. */
export function formatDistance(metres: number, lang: 'en' | 'hi' | null | undefined = 'en'): string {
  if (!Number.isFinite(metres) || metres < 0) return '';
  const unit = lang === 'hi' ? { m: 'मी', km: 'कि.मी.' } : { m: 'm', km: 'km' };
  const m = metres < 1000 ? Math.round(metres / 10) * 10 : metres;
  if (m < 1000) return `${Math.max(10, m)} ${unit.m}`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} ${unit.km}` : `${Math.round(km)} ${unit.km}`;
}
