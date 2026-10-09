// KEEP IN SYNC with pooja-api/src/lib/coin-pack.js — a byte-identical copy so the
// live preview here can never disagree with what the API validates and the app shows.
// features/coins/lib/coin-pack.test.mjs fails if the two drift.

/**
 * What a coin pack is worth, worked out from the two numbers an operator sets.
 *
 * An operator enters **coins** and **price (₹)**. Everything else is derived
 * here so it can never disagree with them — and the dashboard form imports a
 * copy of this very function for its live preview, so the preview cannot
 * differ from what devotees are shown. Keep it pure and dependency-free.
 *
 *   baseCoins   = price × coinsPerRupee          (1 coin = ₹1 by default)
 *   extraCoins  = coins − baseCoins
 *   salePct     = round(extraCoins ÷ baseCoins × 100)     "50% EXTRA"
 *   discountPct = round((1 − price ÷ (coins ÷ coinsPerRupee)) × 100)  "33% cheaper"
 *
 * 30 coins for ₹20 → base 20, extra 10, 50% EXTRA, each coin ≈ ₹0.67 (33% cheaper).
 */
export function describePack({ coins, price, coinsPerRupee = 1, showSale = true, saleEndsAt = null }, now = new Date()) {
  const c = Number(coins);
  const p = Number(price);
  const rate = Number(coinsPerRupee) > 0 ? Number(coinsPerRupee) : 1;
  const valid = Number.isInteger(c) && c > 0 && Number.isFinite(p) && p > 0;

  const baseCoins = valid ? Math.round(p * rate) : 0;
  const extraCoins = valid ? c - baseCoins : 0;
  const salePct = baseCoins > 0 && extraCoins > 0 ? Math.round((extraCoins / baseCoins) * 100) : 0;
  const discountPct = valid && extraCoins > 0 ? Math.round((1 - (p * rate) / c) * 100) : 0;
  const costPerCoin = valid ? Number((p / c).toFixed(4)) : 0;

  const ended = saleEndsAt ? new Date(saleEndsAt).getTime() < now.getTime() : false;
  // A sale under 1% is noise, not a promotion: it is not labelled.
  const onSale = !!showSale && salePct >= 1 && !ended;

  return { valid, coins: c, price: p, baseCoins, extraCoins: Math.max(extraCoins, 0), salePct, discountPct, costPerCoin, onSale, saleEnded: ended };
}

/** Why a pack cannot be saved, or null. We never sell coins at a premium. */
export function packProblem({ coins, price, coinsPerRupee = 1 }) {
  const d = describePack({ coins, price, coinsPerRupee });
  if (!d.valid) return 'Coins and price must be positive whole numbers.';
  if (d.coins < d.baseCoins) {
    return `Coins must be at least ${d.baseCoins} for ₹${d.price} (1 coin = ₹${1 / (Number(coinsPerRupee) || 1)}).`;
  }
  return null;
}
