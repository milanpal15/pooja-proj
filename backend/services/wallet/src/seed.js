import { seedCoins } from './modules/coins/index.js';

/**
 * Every default the wallet needs, idempotent and never overwriting an operator's edit: the starter coin packs, only into an EMPTY
 * collection (a pack an operator deleted stays deleted). Throws on failure: server.js retries until it succeeds and `/health`
 * stays 503 meanwhile. The settings (coin rate ...) and flags are engagement's to seed.
 */
export async function seedWallet({ log = () => {} } = {}) {
  const t = Date.now();
  await seedCoins();
  log(`seeded coin packs (${Date.now() - t} ms)`);
}
