import type { ImageSourcePropType } from 'react-native';

/**
 * Deity artwork, keyed by deity id.
 *
 * These are **public-domain oleographs from the Raja Ravi Varma Press**
 * (Varma died in 1906), sourced from Wikimedia Commons — see
 * `assets/images/deities/ATTRIBUTION.md` for the per-file provenance. They
 * replaced watermarked stock renders that the app had no licence to ship.
 *
 * Two consequences of using real paintings rather than cutouts:
 *  - They are **opaque rectangles**, not transparent figures, so they read as
 *    framed artwork in a shrine rather than as a floating murti. Every screen
 *    renders them with `contain` over its own backdrop, which suits that.
 *  - JPEG, not PNG. There is no alpha to preserve and PNG cost ~10 MB of
 *    bundle for the same eight images; JPEG is ~2 MB.
 *
 * Prefer `useContent().deityArt(id)` over reading this directly — the
 * dashboard's uploaded artwork should win when it exists, and this is the
 * offline fallback.
 */
export const DEITY_IMAGES: Record<string, ImageSourcePropType> = {
  shiva: require('@/assets/images/deities/shiva.jpg'),
  shani: require('@/assets/images/deities/shani.jpg'),
  vishnu: require('@/assets/images/deities/vishnu.jpg'),
  ganesh: require('@/assets/images/deities/ganesh.jpg'),
  durga: require('@/assets/images/deities/durga.jpg'),
  hanuman: require('@/assets/images/deities/hanuman.jpg'),
  lakshmi: require('@/assets/images/deities/lakshmi.jpg'),
  krishna: require('@/assets/images/deities/krishna.jpg'),
};
