/**
 * Deity catalogue for the mandir screen. The horizontal strip at the top of the
 * screen scrolls through these and swaps the idol in the sanctum.
 */

import type { ImageSourcePropType } from 'react-native';

export type CrownKind = 'jata' | 'mukut' | 'tall' | 'plain';

export type Deity = {
  id: string;
  /** Hindi label shown in the strip and the title pill. */
  name: string;
  /** Full honorific for the header. */
  title: string;
  /** Skin / murti tone. */
  body: string;
  /** Robe colour. */
  robe: string;
  /** Halo + glow. */
  accent: string;
  /** Trim used for garlands, crown and jewellery. */
  trim: string;
  crown: CrownKind;
  /** Crescent moon in the hair (Shiva). */
  crescent?: boolean;
  /** Cobra behind the shoulder (Shiva). */
  serpent?: boolean;
  /** Elephant head (Ganesha). */
  elephant?: boolean;
  /** Mace resting at the side (Hanuman). */
  mace?: boolean;
  /**
   * Real murti artwork. When set, the sanctum renders this instead of the
   * procedural figure, and everything else (halo, aarti orbit, marigolds)
   * keeps working unchanged:
   *   image: require('@/assets/images/deities/shiva.jpg'),
   *
   * The shipped set is public-domain Ravi Varma oleographs — opaque JPEGs,
   * rendered with `contain`. A transparent PNG/WebP still works and reads
   * more like a murti than a framed painting, if you have one.
   */
  image?: ImageSourcePropType;
  /** Sacred mark floating above the idol. */
  mark: string;
  mantra: string;
  offerings: string[];
};

/** Hindi weekday / month line shown on the sanctum banner. */

export const AARTI_CIRCLES = 5;
