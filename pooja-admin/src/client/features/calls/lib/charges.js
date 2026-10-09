/**
 * The minute-by-minute charge summary for the details dialog.
 *
 * A call is charged for each *started* minute, at the start of that minute, at
 * the rate snapshotted when the call began. The list view carries the total, not
 * the schedule, so the schedule is rebuilt from minutes × rate and only shown
 * when it adds up to what was actually charged — never a made-up breakdown.
 */
export function chargeSummary(call) {
  const coins = Number(call.coins) || 0;
  const minutes =
    Number(call.minutesBilled) || (coins > 0 && Number(call.durationSec) > 0 ? Math.ceil(Number(call.durationSec) / 60) : 0);
  let rate = Number(call.ratePerMin ?? call.ratePerMinSnapshot);
  if (!rate && minutes > 0 && coins % minutes === 0) rate = coins / minutes;
  const adds = minutes > 0 && rate > 0 && rate * minutes === coins;
  return {
    coins,
    minutes,
    rate: rate || null,
    refunded: Number(call.refundedCoins) || 0,
    schedule: adds ? Array.from({ length: minutes }, (_, i) => ({ minute: i + 1, coins: rate, running: rate * (i + 1) })) : [],
  };
}
