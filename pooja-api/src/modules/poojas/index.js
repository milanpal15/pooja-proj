/** poojas module — bookable poojas and their packages. See docs/POOJA_AND_HOME.md §2. */
import { poojaRouters } from './pooja.routes.js';
import { seedPoojas } from './pooja.service.js';

export { Pooja, PoojaReview } from './pooja.model.js';

export const routers = () => poojaRouters();
export const seed = seedPoojas;
