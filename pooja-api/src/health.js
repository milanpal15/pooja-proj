import { config } from './config/env.js';
import { isReady } from './lib/readiness.js';

/**
 * Liveness, and which build is answering.
 *
 * `commit` is what lets CI tell a finished deploy from the old container
 * still serving traffic — polling for "is it up" would pass instantly
 * against the version being replaced. Render sets RENDER_GIT_COMMIT itself.
 */
export const health = (_req, res) => {
  const ready = isReady();
  // 503 while the seeds are still running: the process is alive but not finished starting.
  res.status(ready ? 200 : 503).json({
    ok: ready,
    ...(ready ? {} : { starting: true }),
    uptime: process.uptime(),
    commit: config.commit,
  });
};
