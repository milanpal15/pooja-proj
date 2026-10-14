/** live module — live darshan streams, categories and the Jai counter. See docs/LIVE_DARSHAN.md. */
import { liveRouters } from './live.routes.js';
import { seedLive } from './live.seed.js';
import { startProbe } from './probe.js';

export { LiveCategory, LiveStream } from './live.model.js';
export { migrateTempleStreams } from './live.seed.js';

export const routers = (deps) => liveRouters(deps);
export const seed = seedLive;

/** The 60 s probe. Called only by startModuleJobs (server.js), never under test. */
export function start() {
  startProbe();
}
