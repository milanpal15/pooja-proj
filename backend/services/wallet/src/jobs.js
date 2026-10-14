import { reconcilePending } from './modules/wallet/wallet.service.js';

let timer = null;
let running = false;

/**
 * Background jobs. Called only by server.js after the seeds, never under test.
 *
 * The ledger reconciler: a crash between "ledger row opened" and "balance changed" leaves a `pending` row; this finishes it exactly once
 * (the idempotent `settle()` the monolith's billing ticker used to trigger). Rows younger than 30 s are left alone - they are in flight.
 */
export function startJobs(config, log) {
  if (!config.reconcileEveryMs) {
    log.info('ledger reconciler disabled (RECONCILE_EVERY_MS=0)');
    return;
  }
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await reconcilePending({ olderThanMs: 30_000 });
      if (r.finished) log.info(`reconciler finished ${r.finished} pending ledger row(s)`);
    } catch (e) {
      log.error(`ledger reconcile failed: ${e.message}`);
    } finally {
      running = false;
    }
  };
  timer = setInterval(run, config.reconcileEveryMs);
  timer.unref?.();
  log.info(`ledger reconciler started (every ${config.reconcileEveryMs / 1000} s)`);
}

export const stopJobs = () => {
  clearInterval(timer);
  timer = null;
};
