import { sweepExpiredBlocks } from './lib/sweeper.js';

let timer = null;

/**
 * Background job (started by server.js once the database is ready, never under test): every BLOCK_SWEEP_EVERY_MS write the `auto_unblock` history
 * row for timed blocks that have run out. The block itself stopped applying when `until` passed, with or without this.
 */
export function startJobs(config, { logger }) {
  if (timer) return;
  if (!config.blockSweepEveryMs) { logger.info('block expiry sweeper disabled (BLOCK_SWEEP_EVERY_MS=0)'); return; }
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { accounts, devices } = await sweepExpiredBlocks(new Date());
      if (accounts || devices) logger.info(`block sweeper: lifted ${accounts} account block(s) and ${devices} device block(s)`);
    } catch (e) {
      logger.error(`block sweep failed: ${e.message}`);
    } finally {
      running = false;
    }
  }, config.blockSweepEveryMs);
  timer.unref?.();
  logger.info(`block expiry sweeper started (every ${config.blockSweepEveryMs / 1000} s)`);
}

export const stopJobs = () => { clearInterval(timer); timer = null; };
