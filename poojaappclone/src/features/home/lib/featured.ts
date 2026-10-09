import { daysUntil } from './days';

/** How far ahead a festival is worth a promo card; "begins in 200 days" is noise. */
export const FEATURE_WINDOW_DAYS = 45;

type FestivalPooja = { poojaDate: string | null; festivalName: string; festivalSlug: string };

/**
 * The nearest upcoming FESTIVAL pooja — one tied to a festival and with a fixed
 * date today or later, inside the window. Every-day poojas have no date and are
 * never "featured". Null when there is none, and the promo card is then hidden.
 */
export function pickFeaturedPooja<T extends FestivalPooja>(
  poojas: T[],
  now: number,
): { pooja: T; days: number } | null {
  let best: { pooja: T; days: number } | null = null;
  for (const p of poojas) {
    if (!p.festivalName && !p.festivalSlug) continue;
    const days = daysUntil(p.poojaDate, now);
    if (days === null || days < 0 || days > FEATURE_WINDOW_DAYS) continue;
    if (!best || days < best.days) best = { pooja: p, days };
  }
  return best;
}
