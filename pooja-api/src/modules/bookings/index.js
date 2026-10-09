/** bookings module — pooja bookings paid in coins. See docs/POOJA_AND_HOME.md §3. */
import { bookingsRouters } from './bookings.routes.js';

export const routers = (deps) => bookingsRouters(deps);
export const seed = async () => {};
