import { startTicker, stopTicker } from './modules/calls/index.js';
import { pruneIntents, sweep } from './modules/saga/index.js';

const timers = [];

/**
 * Background jobs. Called only by server.js once the database is ready, never under test.
 *
 *   billing ticker  every TICK_EVERY_MS: bills each started minute of a connected call (key `call:<id>:min:<n>`, the same on every retry), ends
 *                   missed / silent calls, heals a connect-failure refund that never went out. Single-flight per instance; safe beside another
 *                   instance on the same database (atomic conditional updates + idempotent keys). A boot pass runs at once, so a restart
 *                   picks up whatever fell due while the service was down.
 *   refund sweeper  every SWEEP_EVERY_MS: re-sends each old pending refund intent with its same key (and `ofKey`) until the wallet answers. Also what
 *                   finishes whatever the DB split copied across unfinished.
 *   intent pruning  every PRUNE_EVERY_MS: deletes TERMINAL intents (done / failed / expired / refunded) older than INTENT_RETENTION_DAYS.
 *                   A pending intent is never deleted.
 */
export function startJobs(config, log) {
  if (timers.length) return;
  if (config.tickEveryMs) {
    startTicker({ everyMs: config.tickEveryMs });
    log.info(`billing ticker started (every ${config.tickEveryMs / 1000} s)`);
  } else {
    log.info('billing ticker disabled (TICK_EVERY_MS=0)');
  }
  if (config.sweepEveryMs) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        const r = await sweep();
        if (r.checked) log.info(`refund sweeper: checked ${r.checked}, done ${r.done}, failed ${r.failed}, waiting ${r.waiting}`);
      } catch (e) {
        log.error(`refund sweep failed: ${e.message}`);
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(run, config.sweepEveryMs));
    log.info(`refund sweeper started (every ${config.sweepEveryMs / 1000} s)`);
  } else {
    log.info('refund sweeper disabled (SWEEP_EVERY_MS=0)');
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
  stopTicker();
};
