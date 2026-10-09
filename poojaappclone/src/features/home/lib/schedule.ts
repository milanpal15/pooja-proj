/**
 * Is `now` inside a `[startsAt, endsAt]` window? Either end may be null/absent
 * (open-ended). The API already filters, but a slide can start or expire while
 * the app is open, so the client re-checks against the clock.
 */
export function inWindow(startsAt: string | null | undefined, endsAt: string | null | undefined, now: number): boolean {
  if (startsAt) {
    const s = Date.parse(startsAt);
    if (!Number.isNaN(s) && now < s) return false;
  }
  if (endsAt) {
    const e = Date.parse(endsAt);
    if (!Number.isNaN(e) && now > e) return false;
  }
  return true;
}
