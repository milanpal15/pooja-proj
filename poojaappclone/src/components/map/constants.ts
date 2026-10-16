import type { Bounds } from './geometry';

/** Primitives every map screen shares (the temples map, the Yatra route map). */

/** Smallest span (degrees) the camera fits to, so one place does not zoom to the rooftops. */
export const MIN_FIT_SPAN_DEG = 0.05;
export const FIT_PADDING = { top: 90, right: 50, bottom: 60, left: 50 } as const;

/** West, south, east, north — all of India, the last resort for the first view. */
export const INDIA_BOUNDS: Bounds = [68.1, 6.7, 97.4, 35.7];

/** Glyph stack the OpenFreeMap styles ship; only affects labels, never the pins. */
export const TEXT_FONT = ['Noto Sans Regular'];

/** The devotee's own dot. */
export const USER_COLOR = '#2979FF';
