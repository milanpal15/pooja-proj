/**
 * Semantic colour roles.
 *
 * The Stitch export gave us twelve beautiful screens that disagreed with each
 * other: five different bottom bars, three different meanings for "active",
 * and gold used for both ornament and body text. The fix is not more hexes —
 * it is fewer, with jobs.
 *
 * ── The three brand roles, and what each one is for ──────────────────────
 *
 *   primary  (kumkum red)   IDENTITY & NAVIGATION.  Wordmark, active tab,
 *                           selected chip, section anchors. Never a big
 *                           filled button — that job belongs to accent.
 *
 *   accent   (saffron)      ACTION.  Exactly one filled accent control per
 *                           screen: Pay Now, Verify & Proceed, Donate.
 *                           Scarcity is what makes it read as "the button".
 *
 *   gold                    ORNAMENT ONLY.  Hairlines, rules, mandalas, ring
 *                           strokes, the aarti glow. `gold` measures 2.3:1 on
 *                           cream and must never carry text — use `goldInk`
 *                           (6.1:1) when text needs to feel gold.
 *
 * ── Surface modes ────────────────────────────────────────────────────────
 *
 * Every scheme ships two complete role sets:
 *
 *   colors    "cream"   — the default reading surface (Home, Temples, Journal)
 *   sanctum   "sanctum" — the immersive ember surface (Pooja, Bhajan header)
 *
 * The export drew the sanctum as a one-off illustration. Treating it as a
 * surface mode instead is what lets the tab bar, app bar and cards re-tone
 * together rather than being re-invented per screen.
 */

import { Ember, Gold, Kumkum, Saffron, Sandal, Status } from './palette';

export type ColorRoles = {
  /* -------------------------------------------------------- surfaces -- */
  surface: string;
  surfaceDim: string;
  /** Pure-white cards that "pop forward" off the cream base. */
  containerLowest: string;
  containerLow: string;
  container: string;
  containerHigh: string;
  containerHighest: string;

  /* ------------------------------------------------------------ ink -- */
  onSurface: string;
  onSurfaceVariant: string;
  /** Placeholders, disabled labels, timestamps. */
  onSurfaceFaint: string;
  outline: string;
  outlineVariant: string;

  /* ---------------------------------------------------------- brand -- */
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  accent: string;
  onAccent: string;
  accentContainer: string;
  onAccentContainer: string;

  /** Ornament only — borders, rules, mandala strokes. Never text. */
  gold: string;
  /** The text-safe gold step. */
  goldInk: string;
  /** 1px ornamental card border. */
  goldHairline: string;

  /* ------------------------------------------------------ gradients -- */
  /** "Sunlight": saffron → amber. Primary action buttons. */
  sunlight: readonly [string, string];
  /** The sanctum backdrop, top → bottom. */
  emberWash: readonly [string, string, string];

  /* --------------------------------------------------------- status -- */
  error: string;
  onError: string;
  errorContainer: string;
  success: string;
  successContainer: string;
  /** Live-stream badge. Reserved; not a decorative red. */
  live: string;

  /* ------------------------------------------------- glass & scrims -- */
  glass: string;
  glassBorder: string;
  scrim: string;
  /** Ambient glow colour for the diya-lamp shadow treatment. */
  glowTint: string;
};

/* ══════════════════════════════════════════════════════════ light ═══ */

const lightCream: ColorRoles = {
  surface: Sandal[50],
  surfaceDim: Sandal[500],
  containerLowest: Sandal[0],
  containerLow: Sandal[100],
  container: Sandal[200],
  containerHigh: Sandal[300],
  containerHighest: Sandal[400],

  onSurface: Sandal[950],
  onSurfaceVariant: Sandal[800],
  onSurfaceFaint: Sandal[700],
  outline: Sandal[700],
  outlineVariant: '#E8D9C0',

  primary: Kumkum[500],
  onPrimary: '#FFFFFF',
  primaryContainer: Kumkum[100],
  onPrimaryContainer: Kumkum[700],

  accent: Saffron[300],
  // NOT white. White on saffron is 2.16:1 — every "Pay Now" and "Donate Now"
  // in the export is unreadable by measurement. Dark ink on the same fill is
  // 8.0:1, and matches the export's own `on-secondary-container` token, which
  // its screens ignored.
  onAccent: Saffron[800],
  accentContainer: Saffron[50],
  onAccentContainer: Saffron[700],

  gold: Gold[300],
  goldInk: Gold[500],
  goldHairline: 'rgba(201,162,39,0.42)',

  sunlight: [Saffron[300], Saffron[400]] as const,
  emberWash: [Ember[500], Ember[600], Ember[700]] as const,

  error: Status.errorLight,
  onError: '#FFFFFF',
  errorContainer: Status.errorContainerLight,
  success: Status.successLight,
  successContainer: Status.successContainerLight,
  live: Status.liveLight,

  glass: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(201,162,39,0.30)',
  scrim: 'rgba(29,28,19,0.45)',
  glowTint: 'rgba(255,152,0,0.20)',
};

/** The immersive ember surface, as seen on a light-scheme device. */
const lightSanctum: ColorRoles = {
  surface: Ember[600],
  surfaceDim: Ember[700],
  containerLowest: 'rgba(255,255,255,0.10)',
  containerLow: 'rgba(255,255,255,0.07)',
  container: 'rgba(255,255,255,0.12)',
  containerHigh: 'rgba(255,255,255,0.16)',
  containerHighest: 'rgba(255,255,255,0.22)',

  onSurface: Ember[50],
  onSurfaceVariant: Ember[100],
  onSurfaceFaint: Ember[200],
  outline: 'rgba(233,196,0,0.38)',
  outlineVariant: 'rgba(233,196,0,0.20)',

  primary: Gold[100],
  onPrimary: Ember[700],
  primaryContainer: 'rgba(233,196,0,0.18)',
  onPrimaryContainer: Gold[50],

  accent: Saffron[200],
  onAccent: Ember[800],
  accentContainer: 'rgba(255,152,0,0.20)',
  onAccentContainer: Saffron[100],

  gold: Gold[200],
  goldInk: Gold[100],
  goldHairline: 'rgba(233,196,0,0.34)',

  sunlight: [Saffron[200], Gold[100]] as const,
  emberWash: [Ember[500], Ember[600], Ember[700]] as const,

  error: Status.errorDark,
  onError: '#690005',
  errorContainer: Status.errorContainerDark,
  success: Status.successDark,
  successContainer: Status.successContainerDark,
  live: Status.liveDark,

  glass: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(233,196,0,0.28)',
  scrim: 'rgba(0,0,0,0.55)',
  glowTint: 'rgba(255,184,112,0.30)',
};

/* ═══════════════════════════════════════════════════════════ dark ═══ */

const darkCream: ColorRoles = {
  surface: Ember[900],
  surfaceDim: Ember[950],
  containerLowest: Ember[950],
  containerLow: Ember[800],
  container: Ember[700],
  containerHigh: Ember[600],
  containerHighest: Ember[500],

  onSurface: Ember[50],
  onSurfaceVariant: Ember[100],
  onSurfaceFaint: Ember[200],
  outline: '#7A6350',
  outlineVariant: 'rgba(196,185,164,0.20)',

  primary: Kumkum[200],
  onPrimary: Kumkum[800],
  primaryContainer: Kumkum[700],
  onPrimaryContainer: Kumkum[100],

  accent: Saffron[200],
  onAccent: Saffron[800],
  accentContainer: Saffron[700],
  onAccentContainer: Saffron[100],

  gold: Gold[200],
  goldInk: Gold[100],
  goldHairline: 'rgba(233,196,0,0.30)',

  sunlight: [Saffron[200], Gold[100]] as const,
  emberWash: [Ember[700], Ember[800], Ember[900]] as const,

  error: Status.errorDark,
  onError: '#690005',
  errorContainer: Status.errorContainerDark,
  success: Status.successDark,
  successContainer: Status.successContainerDark,
  live: Status.liveDark,

  glass: 'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(233,196,0,0.24)',
  scrim: 'rgba(0,0,0,0.62)',
  glowTint: 'rgba(255,184,112,0.24)',
};

/** In dark scheme the sanctum deepens rather than inverting. */
const darkSanctum: ColorRoles = {
  ...lightSanctum,
  surface: Ember[800],
  surfaceDim: Ember[900],
  emberWash: [Ember[600], Ember[700], Ember[900]] as const,
};

/* ═════════════════════════════════════════════════════════ export ═══ */

export type Scheme = 'light' | 'dark';
export type SurfaceMode = 'cream' | 'sanctum';

export const Schemes: Record<Scheme, Record<SurfaceMode, ColorRoles>> = {
  light: { cream: lightCream, sanctum: lightSanctum },
  dark: { cream: darkCream, sanctum: darkSanctum },
};

/* ───────────────────────────────────────────────────────── geometry ── */

/**
 * Absolute fill. `StyleSheet.absoluteFillObject` is missing from RN 0.86's
 * type definitions, so this stands in for it across the system.
 */
export const Fill = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;

/** Corner radii. `arch` is the temple-arch treatment for featured media. */
export const Radius = {
  sm: 4,
  md: 12,
  lg: 16,
  xl: 24,
  /** Ogive top corners; pair with a small bottom radius. */
  arch: 96,
  full: 9999,
} as const;

/** 8px vertical rhythm, per the design system's meditative spacing. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  /** Screen side margin — generous, so the UI never feels cramped. */
  margin: 20,
  gutter: 16,
  cardPadding: 16,
} as const;

/**
 * Ambient "aura" elevation. The system forbids harsh grey shadows; depth is
 * a diffused saffron glow, as if the element were radiating light.
 */
export const Elevation = {
  none: {},
  /** Resting cards. */
  low: {
    shadowColor: '#FF9800',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  /** Primary buttons, floating bars. */
  mid: {
    shadowColor: '#FF9800',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  /** Modals and the aarti thali. */
  high: {
    shadowColor: '#D3641B',
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const;

/** Motion. Slow and settled — the system is meant to feel meditative. */
export const Motion = {
  /** Taps, chips, toggles. */
  quick: 160,
  /** Screen elements settling in. */
  settle: 320,
  /** Deity cross-fade, aarti transitions. */
  ceremonial: 420,
  /** Ambient loops: flame flicker, glow breathing. */
  ambient: 2400,
} as const;
