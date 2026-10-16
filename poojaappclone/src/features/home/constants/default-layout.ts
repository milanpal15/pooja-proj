import { DEFAULT_LAYOUT_ID, parseLayout } from '../lib/layout';
import type { HomeLayout, Layout } from '../lib/layout-types';
import json from './default-layout.json';

/**
 * The layout set used when the API is unreachable and nothing is cached — the
 * contract's §5 default, byte-identical to the catalog service's copy
 * (`default-layout.json`; change both together). A v1 `{blocks}` file is wrapped
 * as the `default` layout by `parseLayout`. `parseLayout` cannot fail on it (a
 * test asserts that); the empty fallback only keeps the type honest.
 */
export const DEFAULT_LAYOUT: HomeLayout = parseLayout(json) ?? { schemaVersion: 2, layouts: [] };

/** The single layout of the bundled set — the last resort of `selectLayout`. */
export const BUNDLED_LAYOUT: Layout =
  DEFAULT_LAYOUT.layouts.find((l) => l.id === DEFAULT_LAYOUT_ID) ??
  DEFAULT_LAYOUT.layouts[0] ?? { id: DEFAULT_LAYOUT_ID, name: '', enabled: true, audience: [], startsAt: null, endsAt: null, blocks: [] };
