/**
 * Raw colour ramps for the Sacred Devotion system.
 *
 * Nothing in the app imports from this file directly — screens use the
 * semantic roles in `tokens.ts`. Ramps exist so a role can be re-pointed at a
 * different step without inventing a new hex.
 *
 * Derived from the Stitch export's DESIGN.md, with three corrections:
 *
 *  1. The export's neutrals drifted mauve (`outline #8f6f6c`,
 *     `outline-variant #e4beba`, `on-surface-variant #5b403d`). Against a
 *     marigold/sandalwood surface that reads as a mistake rather than a
 *     choice, so the neutral ramp is re-toned warm brown.
 *  2. Gold `#c9a900` was used for headings on cream in several screens. It
 *     measures 2.3:1 there — unreadable. Gold is now ornament-only and a
 *     darker `goldInk` step exists for text that needs to feel gold (6.1:1).
 *  3. The e-Chadhava screen used a navy chip that appears nowhere else in the
 *     system. Dropped; selection uses kumkum red.
 */

/** Kumkum — identity and navigation. The colour of the app itself. */
export const Kumkum = {
  50: '#FFF2F0',
  100: '#FFDAD6',
  200: '#FFB3AC',
  300: '#F27A72',
  400: '#D32F2F',
  500: '#AF101A', // primary
  600: '#930010',
  700: '#6E0009',
  800: '#410003',
} as const;

/** Saffron — the action ramp. Buttons, calls to action, the "sunlight" gradient. */
export const Saffron = {
  50: '#FFF4E3',
  100: '#FFDCBE',
  200: '#FFB870',
  300: '#FF9800',
  400: '#E98A1E',
  500: '#D3641B',
  600: '#A85A10',
  700: '#693C00',
  800: '#2C1600',
} as const;

/** Gold — ornament. Borders, rules, mandalas, ring strokes, aarti glow. */
export const Gold = {
  50: '#FFF8DC',
  100: '#FFE16D',
  200: '#E9C400',
  300: '#C9A227', // ornament only — 2.3:1 on cream, never text
  400: '#A98411',
  500: '#7A5A12', // goldInk — 6.1:1 on cream, safe for text
  600: '#544600',
  700: '#221B00',
} as const;

/** Sandalwood — the warm neutral spine. Surfaces in light, ink in dark. */
export const Sandal = {
  0: '#FFFFFF',
  50: '#FFF9EB', // surface
  100: '#F9F3E5',
  200: '#F3EDE0',
  300: '#EDE8DA',
  400: '#E8E2D4',
  500: '#DFDACC',
  600: '#C4B9A4',
  700: '#806448', // outline / faint ink — 5.2:1 on cream
  800: '#5C4A38', // secondary ink
  900: '#332B22',
  950: '#1D1C13', // primary ink
} as const;

/**
 * Ember — the sanctum. The immersive dark red of the Premium Pooja screen,
 * which the export treated as a one-off illustration. Here it is a full
 * surface ramp, which is what lets dark mode and the sanctum share a system.
 */
export const Ember = {
  50: '#F6F0E2',
  100: '#E4D3C4',
  200: '#C9A99A',
  300: '#9E6B58',
  400: '#7B3B2E',
  500: '#5C2019',
  600: '#451411',
  700: '#33100E',
  800: '#24100D',
  900: '#1A0E0C',
  950: '#120908',
} as const;

/** Semantic status. Reserved — never reused as a decorative accent. */
export const Status = {
  errorLight: '#BA1A1A',
  errorDark: '#FFB4AB',
  errorContainerLight: '#FFDAD6',
  errorContainerDark: '#93000A',

  successLight: '#2E6B4F',
  successDark: '#79D3A5',
  successContainerLight: '#D5EDDF',
  successContainerDark: '#0E3323',

  liveLight: '#C62828', // white on this is 5.6:1; #E33629 was 4.35:1
  liveDark: '#FF7A6B',
} as const;
