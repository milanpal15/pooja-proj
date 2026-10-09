export type Bill = { packageCoins: number; prasadCoins: number; total: number };

/**
 * What the devotee will be charged. DISPLAY ONLY — the server prices the order
 * from its own database; the app never sends this number.
 */
export function billFor(packageCoins: number, prasadFeeCoins: number, prasad: boolean): Bill {
  const prasadCoins = prasad ? Math.max(0, prasadFeeCoins) : 0;
  return { packageCoins, prasadCoins, total: packageCoins + prasadCoins };
}
