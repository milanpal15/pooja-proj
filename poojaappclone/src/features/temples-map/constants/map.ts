export { FIT_PADDING, INDIA_BOUNDS, MIN_FIT_SPAN_DEG, TEXT_FONT } from '@/components/map/constants';

/** Default radius (metres) of a nearby-temples search. The server clamps to 500..25000. */
export const DEFAULT_RADIUS_M = 8000;
export const MIN_RADIUS_M = 500;
export const MAX_RADIUS_M = 25_000;

/** A search is only offered once the map is at least this zoomed in (below it the view spans a state, not a town). */
export const SEARCH_MIN_ZOOM = 9;
/** Zoom used when centring on the user or on a single place. */
export const FOCUS_ZOOM = 13.5;
/** Quiet time after the camera settles before "Search this area" is reconsidered. */
export const VIEW_DEBOUNCE_MS = 450;


/** A search offered after moving this far (or 35% of the last radius, whichever is greater). */
export const MOVE_MIN_M = 800;
export const MOVE_RADIUS_FRACTION = 0.35;

/** A managed temple hides any OSM place this close (the server does the same; both sides, so it holds offline). */
export const DEDUPE_RADIUS_M = 150;
/** Pins drawn at most (the API caps at 80). */
export const MAX_PLACES = 80;

export const DEFAULT_ATTRIBUTION = '© OpenStreetMap contributors';

export const SOURCE_IDS = {
  osm: 'osm-temples',
  managed: 'managed-temples',
  selection: 'map-selection',
  user: 'map-user',
} as const;
