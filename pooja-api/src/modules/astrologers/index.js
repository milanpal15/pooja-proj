import { astrologerRouters } from './astrologer.routes.js';

export { Astrologer, effectivePresence } from './astrologer.model.js';
export { claimAstrologer } from './claim.js';

export const routers = (deps) => astrologerRouters(deps);

/** Deliberately seeds nothing: astrologers are people an operator adds, never demo data. */
export const seed = async () => {};
