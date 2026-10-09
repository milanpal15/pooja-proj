import { ensureSetting } from '../../lib/settings.js';
import { Flag } from '../../models.js';
import { CoinPack } from './coins.model.js';

/** Starter packs: [coins, ₹, order]. 30-for-₹20 and the bigger ones are the "sale" packs. */
const STARTER_PACKS = [
  [20, 20],
  [30, 20],
  [120, 100],
  [250, 250],
  [650, 500],
  [1400, 1000],
];

/**
 * Idempotent, and never overwrites an operator's edit.
 * Settings and the flag use set-on-insert; packs only seed an EMPTY collection,
 * otherwise a pack an operator deliberately deleted would return on every boot.
 */
export async function seedCoins() {
  await ensureSetting('coinsPerRupee', 1, 'Coins per rupee', 'Base value used to work out sale percentages.');
  await ensureSetting('chadhavaServiceFee', 5, 'Chadhava service fee (coins)', 'Added to every chadhava offering.');
  await ensureSetting('chadhavaMinAmount', 1, 'Chadhava minimum amount (coins)', 'Smallest offering amount.');
  await ensureSetting('bookingCancelHours', 0, 'Booking refund cut-off (hours)', 'Hours before the seva day after which a cancellation is not refunded. 0 = until the seva date.');

  // Deployments seeded before coins existed still carry the old flag text.
  await Flag.updateOne({ key: 'payments', label: 'Payments' }, { $set: { label: 'Coin purchases', desc: 'Buying coins with Razorpay' } });
  await Flag.updateOne(
    { key: 'astrologerCalls' },
    { $setOnInsert: { key: 'astrologerCalls', label: 'Astrologer Calls', desc: 'Talk to an astrologer', enabled: true } },
    { upsert: true },
  );

  if ((await CoinPack.countDocuments()) === 0) {
    await CoinPack.insertMany(
      STARTER_PACKS.map(([coins, price], i) => ({ coins, price, order: i, active: true, showSale: coins > price })),
    );
  }
}
