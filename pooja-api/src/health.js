import { config } from './config/env.js';

/**
 * Liveness, and which build is answering.
 *
 * `commit` is what lets CI tell a finished deploy from the old container
 * still serving traffic — polling for "is it up" would pass instantly
 * against the version being replaced. Render sets RENDER_GIT_COMMIT itself.
 */
export const health = (_req, res) =>
  res.json({
    ok: true,
    uptime: process.uptime(),
    commit: config.commit,
  });
