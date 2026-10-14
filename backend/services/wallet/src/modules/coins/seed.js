import { CoinPack } from './coins.model.js';

/** Starter packs: [coins, ₹]. 30-for-₹20 and the bigger ones are the "sale" packs. */
const STARTER_PACKS = [
  [20, 20],
  [30, 20],
  [120, 100],
  [250, 250],
  [650, 500],
  [1400, 1000],
];

/**
 * Idempotent, and never overwrites an operator's edit: packs only seed an EMPTY collection, otherwise a pack an operator
 * deliberately deleted would return on every boot. (The settings the monolith's seed also wrote - coin rate, chadhava fee, refund
 * cut-off - and the flags are engagement's; it seeds them itself.)
 */
export async function seedCoins() {
  if ((await CoinPack.countDocuments()) === 0) {
    await CoinPack.insertMany(
      STARTER_PACKS.map(([coins, price], i) => ({ coins, price, order: i, active: true, showSale: coins > price })),
    );
  }
}
