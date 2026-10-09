import { useEffect, useState } from 'react';

/**
 * "rings in 11h 48m" is read against a clock, and reading `Date.now()`
 * during render is impure — it also goes stale while the screen is open.
 * A half-minute tick keeps it honest and satisfies the compiler.
 */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
