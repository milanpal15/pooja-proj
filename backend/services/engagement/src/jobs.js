import { expireApprovals } from './lib/control.js';

let timer = null;

/**
 * Background job (started by server.js once the database is ready, never under test): every APPROVAL_SWEEP_EVERY_MS turn pending approval
 * requests past their 24 h expiry into `expired`. Listings expire lazily too, so this only keeps the stored status honest.
 */
export function startJobs(config, { logger }) {
  if (timer) return;
  if (!config.approvalSweepEveryMs) { logger.info('approval expiry sweeper disabled (APPROVAL_SWEEP_EVERY_MS=0)'); return; }
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const n = await expireApprovals(new Date());
      if (n) logger.info(`approval sweeper: expired ${n} request(s)`);
    } catch (e) {
      logger.error(`approval sweep failed: ${e.message}`);
    } finally {
      running = false;
    }
  }, config.approvalSweepEveryMs);
  timer.unref?.();
  logger.info(`approval expiry sweeper started (every ${config.approvalSweepEveryMs / 1000} s)`);
}

export const stopJobs = () => { clearInterval(timer); timer = null; };
