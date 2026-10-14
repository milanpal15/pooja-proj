import { pruneIntents, sweep } from './modules/saga/index.js';

const timers = [];

/**
 * Background jobs. Called only by server.js once the database is ready, never under test.
 *
 *   saga sweeper   every SWEEP_EVERY_MS: resolves each old pending intent - completes the order behind a debit whose answer was lost, closes
 *                  one that never reached the wallet, and re-sends a queued refund with its same key. Also what finishes whatever the DB split
 *                  copied across unfinished.
 *   intent pruning every PRUNE_EVERY_MS: deletes TERMINAL intents (done / failed / expired / refunded) older than INTENT_RETENTION_DAYS.
 *                  A pending intent is never deleted.
 */
export function startJobs(config, log) {
  if (timers.length) return;
  if (config.sweepEveryMs) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const r = await sweep();
        if (r.checked) log.info(`saga sweeper: checked ${r.checked}, done ${r.done}, failed ${r.failed}, expired ${r.expired}, waiting ${r.waiting}`);
      } catch (e) {
        log.error(`saga sweep failed: ${e.message}`);
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(run, config.sweepEveryMs));
    log.info(`saga sweeper started (every ${config.sweepEveryMs / 1000} s)`);
  } else {
    log.info('saga sweeper disabled (SWEEP_EVERY_MS=0)');
  }
  if (config.pruneEveryMs) {
    const prune = async () => {
      try {
        const n = await pruneIntents({ retentionDays: config.intentRetentionDays });
        if (n) log.info(`pruned ${n} terminal intent(s) older than ${config.intentRetentionDays} days`);
      } catch (e) {
        log.error(`intent pruning failed: ${e.message}`);
      }
    };
    prune();
    timers.push(setInterval(prune, config.pruneEveryMs));
    log.info(`intent pruning started (every ${config.pruneEveryMs / 1000} s, keeping ${config.intentRetentionDays} days)`);
  }
  for (const t of timers) t.unref?.();
}

export const stopJobs = () => {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
};

