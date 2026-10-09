/**
 * coins module — packs, Razorpay/mock purchases, billing rules.
 * See docs/COINS_AND_ASTROLOGERS.md §1 and §6.
 */
import { coinsRouters } from './coins.routes.js';
import { seedCoins } from './seed.js';

export { creditOrder } from './coins.service.js';
export { CoinOrder, CoinPack } from './coins.model.js';

export const routers = (deps) => coinsRouters(deps);
export const seed = seedCoins;
