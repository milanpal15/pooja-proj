/**
 * Has startup finished? The port opens as soon as the database is connected (a host such as
 * Render gives up on a service that does not bind within minutes), while the seeds run behind it.
 * `/api/health` answers 503 until `markReady()`, so a health check or CI waits for real readiness
 * instead of racing the seeds — the smoke test needs the first operator they create.
 */
let ready = false;

export const isReady = () => ready;
export const markReady = () => {
  ready = true;
};
