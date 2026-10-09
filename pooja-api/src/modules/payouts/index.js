import { payoutRouters } from './payout.routes.js';

export { AstrologerEarning, Payout } from './payout.model.js';
export * as payoutService from './payout.service.js';

export const routers = (deps) => payoutRouters(deps);
export const seed = async () => {};
