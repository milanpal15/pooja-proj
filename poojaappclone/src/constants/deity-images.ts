import type { ImageSourcePropType } from 'react-native';

/**
 * Real deity artwork, keyed by deity id. Any entry here overrides the drawn
 * murti on the mandir screen; missing entries fall back to the drawn figure.
 *
 * Images are background-removed, transparent, square PNGs in
 * assets/images/deities/ (see that folder's README to add or replace them).
 */
export const DEITY_IMAGES: Record<string, ImageSourcePropType> = {
  shiva: require('@/assets/images/deities/shiva.png'),
  shani: require('@/assets/images/deities/shani.png'),
  vishnu: require('@/assets/images/deities/vishnu.png'),
  ganesh: require('@/assets/images/deities/ganesh.png'),
  durga: require('@/assets/images/deities/durga.png'),
  hanuman: require('@/assets/images/deities/hanuman.png'),
  // lakshmi, krishna: no artwork yet — they fall back to the drawn murti.
};
