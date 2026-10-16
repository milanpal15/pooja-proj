/** home module — the dashboard-driven Home layout. See docs/POOJA_AND_HOME.md §1. */
import { homeRouters } from './home.routes.js';
import { seedHome } from './home.seed.js';
import { layoutRouters } from './layout.routes.js';
import { seedHomeLayout } from './layout.seed.js';

export { HomeSection } from './home.model.js';
export { publicHero, publicHome } from './home.public.js';

export { layoutPublicRoutes } from './layout.public.js';
export { HomeLayoutDraft, HomeLayoutVersion } from './layout.model.js';

export const routers = () => {
  const sections = homeRouters();
  return { admin: [layoutRouters().admin, sections.admin] };
};
/** The layout seeds FIRST (so a fresh database gets the pure default), then the legacy sections. */
export const seed = async () => {
  await seedHomeLayout();
  await seedHome();
};
