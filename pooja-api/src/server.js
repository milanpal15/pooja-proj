/**
 * The backend, as its own service (boot only — `app.js` builds the app).
 *
 * It used to live inside `pooja-admin/`, which made the phone app's API a
 * subfolder of the admin tool: the app could not be served without the
 * dashboard also running, and locking the dashboard down meant locking the
 * app out. They are separate concerns on one database, and now separate
 * processes — the app talks to this, the dashboard talks to this, and
 * neither depends on the other being up.
 *
 * This serves BOTH surfaces, gated: the app's endpoints are the allowlist
 * in `middleware/access.js`, everything else wants an operator session.
 */
import 'dotenv/config';

import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDb } from './db/connect.js';
import { ensureFirstOperator } from './modules/operators/index.js';
import { seedModules, startModuleJobs } from './modules/index.js';

const app = createApp();

/*
 * Nothing should reach these — `asyncRouter` and the handler above catch
 * what routes throw — but a rejection from a timer or a stray listener
 * would still end the process, and an API that dies on one bad request is
 * worse than one that logs and keeps serving.
 */
process.on('unhandledRejection', (reason) => {
  console.error('✗ Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught exception:', err?.stack || err);
});

connectDb(config.mongodbUri)
  // Operators live in the database now, so the first one can only be
  // created once there is a connection — not at import time.
  .then(ensureFirstOperator)
  .then(seedModules)
  .then(() => {
    startModuleJobs();
    app.listen(config.port, () =>
      console.log(`✓ API on http://localhost:${config.port}`),
    );
  })
  .catch((err) => {
    console.error('✗ Failed to start — is MongoDB running?', err.message);
    process.exit(1);
  });
