/**
 * Sacred Devotion — the design system's public entry point.
 *
 *   import { useTheme, Space, Radius } from '@/theme';
 *
 * A screen reads colours from `useTheme().c`, which resolves to the right
 * role set for the current scheme (light/dark) *and* surface mode
 * (cream/sanctum). Wrapping a subtree in `<Surface mode="sanctum">` re-tones
 * everything inside it — app bar, cards, buttons, tab bar — without any
 * screen hand-rolling an "immersive" variant.
 */

import '@/global.css';

export { contrast, type ContrastGrade, grade, luminance } from './contrast';
export { Ember, Gold, Kumkum, Saffron, Sandal, Status } from './palette';
export {
  BottomTabInset,
  type ColorRoles,
  Elevation,
  Fill,
  Motion,
  Radius,
  type Scheme,
  Schemes,
  Space,
  type SurfaceMode,
  TopTabInset,
} from './tokens';
export {
  DEVA_LINE_BOOST,
  Family,
  fontFor,
  hasDevanagari,
  tabularNums,
  Type,
  type TypeVariant,
  typeStyle,
} from './typography';
export { SacredFonts, useSacredFonts } from './fonts';
export {
  Surface,
  ThemeProvider,
  type ThemePreference,
  useTheme,
  useThemePreference,
} from './provider';
