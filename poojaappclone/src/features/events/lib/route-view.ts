/**
 * Where the Yatra map is drawn (pure, so it is testable). The native map is rendered by exactly ONE
 * view at a time: the event banner, or — while it is open — the full-screen view.
 */
export type BannerMode = 'map' | 'cover';
export type MapHost = 'banner' | 'fullscreen' | 'none';

/** The banner shows the live map only for an event with a route, with the native module present and not failed. */
export function bannerMode(i: { hasRoute: boolean; mapAvailable: boolean; mapFailed: boolean }): BannerMode {
  return i.hasRoute && i.mapAvailable && !i.mapFailed ? 'map' : 'cover';
}

/** Which view owns the map right now. */
export function mapHost(i: { mode: BannerMode; fullscreenOpen: boolean }): MapHost {
  if (i.mode !== 'map') return 'none';
  return i.fullscreenOpen ? 'fullscreen' : 'banner';
}

/** Full screen can only be open while the map works (if it fails, the view falls away by itself). */
export const fullscreenOpen = (requested: boolean, mode: BannerMode): boolean => requested && mode === 'map';
