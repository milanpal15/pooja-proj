/** Balance after paying, or null while the balance is unknown. May be negative (= short). */
export const balanceAfter = (balance: number | null, total: number): number | null =>
  balance == null ? null : balance - total;

/** Coins missing for `total`; 0 when covered or when the balance is unknown. */
export const shortBy = (balance: number | null, total: number): number =>
  balance == null ? 0 : Math.max(0, total - balance);
