import { startProbe } from './modules/live/probe.js';

/** Background jobs. Called only by server.js after the seeds, never under test. */
export function startJobs(config, log) {
  if (config.probeEnabled) {
    startProbe();
    log.info('live-stream probe started (every 60 s)');
  } else {
    log.info('live-stream probe disabled (LIVE_PROBE=0)');
  }
}
