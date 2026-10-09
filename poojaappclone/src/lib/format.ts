/**
 * Number formatting shared by every screen that shows coins or rupees.
 *
 * Hand-rolled rather than `Intl.NumberFormat('en-IN')`: Hermes ships Intl on
 * Android but its locale data is not guaranteed on every build, and a wallet
 * balance that renders as "1,250" on one device and "1250" on another is
 * exactly the inconsistency this file exists to prevent.
 */

/**
 * Indian digit grouping: 1,25,000 — the last three digits, then pairs.
 * Coins are integers; anything fractional is rounded, never truncated, so a
 * stray float from the wire cannot show "99.999999".
 */
export function formatCoins(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  const digits = String(Math.abs(v));
  if (digits.length <= 3) return sign + digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${head},${digits.slice(-3)}`;
}

/** A rupee amount, for coin-purchase screens only. */
export function formatRupees(n: number): string {
  return `₹${formatCoins(n)}`;
}

/** Fill `{name}` placeholders. `t()` has no interpolation of its own. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * A v4-style id for idempotency keys. `crypto.randomUUID` is used when the
 * runtime has it; Hermes does not always, and the fallback is plenty for a
 * key that only has to be unique per confirm tap, not unguessable.
 */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Local calendar date as YYYY-MM-DD. `toISOString()` is UTC and is a day behind in IST mornings. */
export function localIsoDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
