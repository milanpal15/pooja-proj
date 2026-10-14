import 'dotenv/config';

import { createLogger } from '@bhakti/common';

import { createApp } from './app.js';
import { config as loadConfig } from './config.js';
import { connectDb, pingDb } from './db.js';
import { seedEngagement } from './seed.js';

const log = createLogger('engagement');
process.on('unhandledRejection', (r) => log.error(`unhandled rejection ${r?.stack || r}`));

const config = loadConfig();
let ready = false;
const app = createApp(config, { isReady: () => ready, dbPing: pingDb, logger: log });

/*
 * Same shape as pooja-api/src/server.js: bind the port as soon as the database is connected, THEN seed in the
 * background (a hosted DB makes every seed query a round trip, and a host gives up on a service that does not
 * bind). /health answers 503 until the seeds finish.
 */
async function seedUntilDone() {
  for (;;) {
    try {
      await seedEngagement();
      log.info('seeded defaults');
      ready = true;
      return;
    } catch (e) {
      log.error(`seeding failed, retrying in 5 s: ${e.message}`); // stays 503 meanwhile: unseeded means no flags
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

connectDb(config)
  .then(() => {
    app.listen(config.port, () => log.info(`listening on http://localhost:${config.port} (db ${config.dbName})`));
    return seedUntilDone();
  })
  .catch((e) => {
    log.error(`failed to start - is MongoDB running? ${e.message}`);
    process.exit(1);
  });
