/**
 * "Sacred Devotion" design system — tokens from the Stitch export's DESIGN.md.
 * A light, warm, marigold/sandalwood/kumkum palette for the temple portal.
 */

export const Sacred = {
  // Surfaces
  surface: '#FFF9EB',
  surfaceDim: '#DFDACC',
  containerLowest: '#FFFFFF',
  containerLow: '#F9F3E5',
  container: '#F3EDE0',
  containerHigh: '#EDE8DA',
  containerHighest: '#E8E2D4',

  // Text
  onSurface: '#1D1C13',
  onSurfaceVariant: '#5B403D',
  outline: '#8F6F6C',
  outlineVariant: '#E4BEBA',

  // Brand
  primary: '#AF101A', // deep red — auspicious, headers, active nav
  onPrimary: '#FFFFFF',
  primaryContainer: '#D32F2F',
  secondary: '#8B5000', // saffron
  secondaryContainer: '#FF9800',
  onSecondaryContainer: '#653900',
  tertiary: '#705D00', // gold
  tertiaryContainer: '#C9A900',
  gold: '#C9A227',

  // Inverse / dark immersive (Premium Pooja)
  inverseSurface: '#333027',
  inverseOnSurface: '#F6F0E2',

  error: '#BA1A1A',

  // Gradients (Sunlight: saffron → gold/orange)
  sunlightFrom: '#FF9800',
  sunlightTo: '#F6C44A',
  primaryGradFrom: '#D3641B',
  primaryGradTo: '#E98A1E',
} as const;

export const Radius = {
  sm: 4,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Space = {
  base: 8,
  containerMargin: 20,
  gutter: 16,
  cardPadding: 16,
} as const;

/** Ambient saffron glow shadow (no harsh grey shadows in this system). */
export const glow = {
  shadowColor: '#FF9800',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
} as const;
