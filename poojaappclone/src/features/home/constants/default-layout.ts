import { parseLayout } from '../lib/layout';
import type { HomeLayout } from '../lib/layout-types';
import json from './default-layout.json';

/**
 * The layout used when the API is unreachable and nothing is cached — the
 * contract's §5 default, byte-identical to the catalog service's copy
 * (`default-layout.json`; change both together). It is the ONLY layout in the
 * app; everything else is served. `parseLayout` cannot fail on it (a test
 * asserts that), the empty fallback only keeps the type honest.
 */
export const DEFAULT_LAYOUT: HomeLayout = parseLayout(json) ?? { schemaVersion: 1, blocks: [] };
