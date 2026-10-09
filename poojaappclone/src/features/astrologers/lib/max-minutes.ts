/** Pure billing arithmetic for the start-call sheet. The server re-checks all of it. */

/** Whole minutes a balance covers at a rate (the first minute is charged on answer). */
export function maxMinutes(balance: number, ratePerMin: number): number {
  if (!(ratePerMin > 0) || !(balance > 0)) return 0;
  return Math.floor(balance / ratePerMin);
}

/** Coins needed before a call may start. */
export function coinsToStart(minMinutes: number, ratePerMin: number): number {
  return Math.max(0, Math.ceil(minMinutes * ratePerMin));
}

/** How many coins short of starting; 0 when the balance is enough. */
export function shortfall(balance: number, minMinutes: number, ratePerMin: number): number {
  return Math.max(0, coinsToStart(minMinutes, ratePerMin) - balance);
}
