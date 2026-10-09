/**
 * Failed-login throttle for the dashboard.
 *
 * Each attempt runs scrypt synchronously, which blocks the whole process for
 * tens of milliseconds, so unlimited guesses are both a password-guessing
 * channel and a cheap way to stall the API. This keeps two small in-memory
 * counters — per (client, username) and per client — and refuses further tries
 * with 429 once either is exhausted.
 *
 * In memory is deliberate: it needs no dependency and no collection, and a
 * single instance is how this is deployed. With several instances each keeps its
 * own count, which only makes the limit looser, never stricter.
 */
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, resetAt }

  const live = (key) => {
    const h = hits.get(key);
    if (!h) return null;
    if (h.resetAt <= now()) {
      hits.delete(key);
      return null;
    }
    return h;
  };

  return {
    /** `{ blocked, retryAfterSec }` — does not count anything. */
    check(key) {
      const h = live(key);
      if (!h || h.count < max) return { blocked: false, retryAfterSec: 0 };
      return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - now()) / 1000)) };
    },
    /** Record one failure. */
    fail(key) {
      const h = live(key);
      if (h) h.count += 1;
      else hits.set(key, { count: 1, resetAt: now() + windowMs });
      if (hits.size > 5000) for (const k of hits.keys()) if (!live(k)) break; // bound memory
    },
    /** A successful login clears that key's failures. */
    reset(key) {
      hits.delete(key);
    },
  };
}

const WINDOW = 15 * 60 * 1000;
/** 10 wrong passwords for one username from one client, per 15 minutes. */
export const perUser = createLimiter({ max: 10, windowMs: WINDOW });
/** 40 failures from one client across any usernames (stops username spraying). */
export const perClient = createLimiter({ max: 40, windowMs: WINDOW });
