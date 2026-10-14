import 'dotenv/config';

import { createLogger } from '@bhakti/common';

import { createApp } from './app.js';
import { config as loadConfig } from './config.js';
import { connectDb, pingDb } from './db.js';
import { startJobs } from './jobs.js';
import { seedCalls } from './seed.js';

const log = createLogger('calls');
process.on('unhandledRejection', (r) => log.error(`unhandled rejection ${r?.stack || r}`));

const config = loadConfig();
let ready = false;
const app = createApp(config, { isReady: () => ready, dbPing: pingDb, logger: log });

/*
 * Same shape as the other services: bind the port as soon as the database is connected, THEN get ready in the background (a hosted DB makes
 * every query a round trip, and a host gives up on a service that does not bind). /health answers 503 until the indexes are built; the saga
 * sweeper starts only after that, so it never resolves an intent against half-built unique indexes.
 */
async function readyUntilDone() {
  for (;;) {
    try {
      await seedCalls({ log: (m) => log.info(m) });
      ready = true;
      startJobs(config, log);
      return;
    } catch (e) {
      log.error(`startup failed, retrying in 5 s: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

connectDb(config)
  .then(() => {
    app.listen(config.port, () => log.info(`listening on http://localhost:${config.port} (db ${config.dbName})`));
    return readyUntilDone();
  })
  .catch((e) => {
    log.error(`failed to start - is MongoDB running? ${e.message}`);
    process.exit(1);
  });
