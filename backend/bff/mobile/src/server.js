import 'dotenv/config';

import { createLogger } from '@bhakti/common';

import { createApp } from './app.js';
import { config } from './config.js';

const log = createLogger('mobile-bff');
process.on('unhandledRejection', (r) => log.error(`unhandled rejection ${r?.stack || r}`));

createApp(config).listen(config.port, () => log.info(`listening on http://localhost:${config.port} -> ${config.monolithUrl}`));
