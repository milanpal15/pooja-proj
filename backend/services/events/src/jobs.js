import { sweep } from './engine/rewards.js';

let timer = null;

/**
 * Background job (started by server.js once the database is ready, never under test): every SWEEP_EVERY_MS retry the coin credits
 * the wallet has not confirmed (same idempotency key every time) and finish badge grants a crash cut short.
 */
export function startJobs(config, { wallet, logger }) {
  if (timer) return;
  if (!config.sweepEveryMs) { logger.info('reward sweeper disabled (SWEEP_EVERY_MS=0)'); return; }
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const r = await sweep({ wallet, logger });
      if (r.checked || r.badges) logger.info(`reward sweeper: checked ${r.checked}, credited ${r.credited}, still pending ${r.stillPending}, badges ${r.badges}`);
    } catch (e) {
      logger.error(`reward sweep failed: ${e.message}`);
    } finally {
      running = false;
    }
  }, config.sweepEveryMs);
  timer.unref?.();
  logger.info(`reward sweeper started (every ${config.sweepEveryMs / 1000} s)`);
}

export const stopJobs = () => { clearInterval(timer); timer = null; };
