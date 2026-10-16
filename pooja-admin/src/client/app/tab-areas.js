/**
 * Back-compat name for the module registry (DESIGN.md §21.3). The data lives in lib/nav/registry.js so the router,
 * the palette and the Roles page can share it; scripts/check-access.mjs still imports TAB_AREAS from here.
 */
import { GROUPS, MODULES } from '../lib/nav/registry.js';

export const TAB_AREAS = MODULES;
export { GROUPS, MODULES };
