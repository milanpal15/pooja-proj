import 'dotenv/config';

import { createLogger } from '@bhakti/common';

import { createApp } from './app.js';
import { config as loadConfig } from './config.js';
import { connectDb, pingDb } from './db.js';
import { startJobs } from './jobs.js';
import { seedIdentity } from './seed.js';

const log = createLogger('identity');
process.on('unhandledRejection', (r) => log.error(`unhandled rejection ${r?.stack || r}`));

const config = loadConfig();
let ready = false;
const app = createApp(config, { isReady: () => ready, dbPing: pingDb, logger: log });

/*
 * Same shape as engagement / pooja-api: bind the port as soon as the database is connected, THEN seed in the background.
 * /health answers 503 until the seeds finish. The first operator is part of "seeded": production refuses to run with
 * no operator and no ADMIN_PASSWORD (a restored backup or a wiped collection must not leave an open - or unreachable -
 * dashboard); dev only warns.
 */
async function seedUntilDone() {
  for (;;) {
    try {
      const first = await seedIdentity(config);
      if (first === 'created') log.info(`created the first operator "${config.adminUsername}" (admin) from ADMIN_PASSWORD`);
      if (first === 'none') {
        if (config.isProduction) {
          log.error('No operators exist and ADMIN_PASSWORD is not set. Refusing to start: there would be no way to sign in. Set ADMIN_PASSWORD.');
          process.exit(1);
        }
        log.warn('No operators and no ADMIN_PASSWORD - the dashboard is UNPROTECTED. Fine on localhost; production refuses to start like this.');
      }
      log.info('seeded defaults');
      ready = true;
      startJobs(config, { logger: log });
      return;
    } catch (e) {
      log.error(`seeding failed, retrying in 5 s: ${e.message}`);
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
