import { backfillBookingFlag, seedContent } from './modules/content/content.seed.js';
import * as chadhava from './modules/chadhava/index.js';
import * as home from './modules/home/index.js';
import * as live from './modules/live/index.js';
import { ensureIndexes } from './modules/media/files.js';
import * as poojas from './modules/poojas/index.js';

/**
 * Every default the catalog needs, idempotent and in the order the monolith ran them (content, the booking backfill, then
 * the modules home, live, poojas, chadhava). Never overwrites an operator's edit; a section/stream/pooja an operator
 * deleted stays deleted because each seeds only into an EMPTY collection. Also the one-off `Temple.liveUrl` -> stream
 * migration (live.seed). Throws on failure: server.js retries until it succeeds and `/health` stays 503 meanwhile.
 */
export async function seedCatalog({ log = () => {} } = {}) {
  const step = async (name, fn) => {
    const t = Date.now();
    await fn();
    log(`seeded ${name} (${Date.now() - t} ms)`);
  };
  await step('content', seedContent);
  await step('temples (booking flag)', backfillBookingFlag);
  await step('home layout', home.seed);
  await step('live (categories, temple streams)', live.seed);
  await step('poojas', poojas.seed);
  await step('chadhava offerings', chadhava.seed);
  await step('media indexes', ensureIndexes);
}
