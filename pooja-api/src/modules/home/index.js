/** home module — the dashboard-driven Home layout. See docs/POOJA_AND_HOME.md §1. */
import { homeRouters } from './home.routes.js';
import { seedHome } from './home.seed.js';

export { HomeSection } from './home.model.js';
export { publicHero, publicHome } from './home.public.js';

export const routers = () => homeRouters();
export const seed = seedHome;
