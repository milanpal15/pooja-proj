/**
 * Type system.
 *
 * ── The Devanagari problem ───────────────────────────────────────────────
 *
 * The Stitch DESIGN.md specifies Be Vietnam Pro for headings and Plus Jakarta
 * Sans for body, and claims both are "designed to be highly legible for both
 * Latin and Devanagari scripts". They are not — neither font ships a single
 * Devanagari glyph.
 *
 * That matters here more than it would in most apps: this one is bilingual by
 * default, and its most sacred strings are Devanagari — deity names (शिव जी),
 * mantras (ॐ नमः शिवाय), offerings, and the entire Hindi UI. Setting the two
 * Latin faces globally would silently drop every one of them to the platform
 * default, so a single screen would render in two unrelated typefaces.
 *
 * The fix is a third face — Noto Sans Devanagari — and a script-aware
 * resolver. `fontFor()` inspects the string and returns the matching family at
 * the same weight, so a Devanagari mantra and a Latin label sit at the same
 * optical weight instead of one looking bolder than the other.
 *
 * Use the `<Type>` component (components/ui/type.tsx) rather than calling this
 * directly — it applies the resolver automatically.
 */

import { Platform, type TextStyle } from 'react-native';

/* ─────────────────────────────────────────────────────────── families ── */

/** Font family names as registered with `useFonts` in theme/fonts.ts. */
export const Family = {
  /** Headings — contemporary grotesk, contrasts the ornamental imagery. */
  display: {
    600: 'BeVietnamPro_600SemiBold',
    700: 'BeVietnamPro_700Bold',
    800: 'BeVietnamPro_800ExtraBold',
  },
  /** Body & labels — soft, rounded terminals; comfortable for long prayers. */
  body: {
    400: 'PlusJakartaSans_400Regular',
    500: 'PlusJakartaSans_500Medium',
    600: 'PlusJakartaSans_600SemiBold',
    700: 'PlusJakartaSans_700Bold',
  },
  /** Devanagari — carries every Hindi string, at matched weights. */
  deva: {
    400: 'NotoSansDevanagari_400Regular',
    500: 'NotoSansDevanagari_500Medium',
    600: 'NotoSansDevanagari_600SemiBold',
    700: 'NotoSansDevanagari_700Bold',
  },
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800;
export type Role = 'display' | 'body';

/**
 * Devanagari block (U+0900–U+097F) plus the extended and Vedic ranges.
 * Matching on the string is cheap and, unlike a locale check, stays correct
 * for a Hindi mantra rendered inside an English screen.
 */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;

export function hasDevanagari(text: unknown): boolean {
  return typeof text === 'string' && DEVANAGARI.test(text);
}

/** Resolve the right family for a string at a given role and weight. */
export function fontFor(text: unknown, role: Role, weight: Weight): string {
  if (hasDevanagari(text)) {
    // Devanagari has no 800; clamp so ExtraBold headings stay renderable.
    const w = (weight >= 700 ? 700 : weight) as 400 | 500 | 600 | 700;
    return Family.deva[w];
  }
  if (role === 'display') {
    const w = (weight <= 600 ? 600 : weight === 700 ? 700 : 800) as 600 | 700 | 800;
    return Family.display[w];
  }
  const w = (weight >= 800 ? 700 : weight) as 400 | 500 | 600 | 700;
  return Family.body[w];
}

/* ────────────────────────────────────────────────────────────── scale ── */

export type TypeToken = {
  role: Role;
  weight: Weight;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: TextStyle['textTransform'];
};

/**
 * The six steps from DESIGN.md, plus the ones the twelve screens actually
 * needed but never declared — a hero step for "Premium Media Library", title
 * steps for card headings, and a tabular numeric step for amounts and counts.
 *
 * Devanagari sits visually smaller than Latin at the same point size and its
 * matras need vertical room, so `<Type>` nudges size and line-height up for
 * Devanagari strings (see LINE_HEIGHT_DEVA_BOOST).
 */
export const Type = {
  /** Screen-owning hero. "Premium Virtual Pooja Experience". */
  display: { role: 'display', weight: 800, fontSize: 34, lineHeight: 42, letterSpacing: -0.4 },
  headlineLg: { role: 'display', weight: 700, fontSize: 26, lineHeight: 32, letterSpacing: -0.2 },
  headlineMd: { role: 'display', weight: 600, fontSize: 24, lineHeight: 30 },
  /** Card and section headings. */
  titleLg: { role: 'display', weight: 600, fontSize: 20, lineHeight: 26 },
  titleMd: { role: 'body', weight: 700, fontSize: 17, lineHeight: 24 },
  titleSm: { role: 'body', weight: 700, fontSize: 15, lineHeight: 20 },

  bodyLg: { role: 'body', weight: 400, fontSize: 18, lineHeight: 28 },
  bodyMd: { role: 'body', weight: 400, fontSize: 16, lineHeight: 24 },
  bodySm: { role: 'body', weight: 400, fontSize: 14, lineHeight: 20 },

  /** Buttons and tab labels. */
  labelLg: { role: 'body', weight: 700, fontSize: 16, lineHeight: 22 },
  labelMd: { role: 'body', weight: 600, fontSize: 13, lineHeight: 18 },
  /** Eyebrows, meta, "SECURE PAYMENT". */
  labelSm: {
    role: 'body',
    weight: 600,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },

  /** Mantras and shlokas — generous leading, never cramped. */
  mantra: { role: 'body', weight: 600, fontSize: 18, lineHeight: 30, letterSpacing: 0.2 },
  /** Amounts, counters, the 108 in the japa ring. */
  numeral: { role: 'display', weight: 800, fontSize: 40, lineHeight: 46, letterSpacing: -0.8 },
} as const satisfies Record<string, TypeToken>;

export type TypeVariant = keyof typeof Type;

/**
 * Devanagari needs a little more vertical room than Latin at the same size —
 * matras sit above the headline and conjuncts hang below the baseline.
 */
export const DEVA_LINE_BOOST = 1.18;

/** Lining, fixed-width figures so amounts and counters don't jitter. */
export const tabularNums: TextStyle = Platform.select({
  ios: { fontVariant: ['tabular-nums'] },
  default: {},
}) as TextStyle;

/** Build a complete RN text style from a variant, resolving script + weight. */
export function typeStyle(variant: TypeVariant, text?: unknown): TextStyle {
  const t = Type[variant] as TypeToken;
  const deva = hasDevanagari(text);
  return {
    fontFamily: fontFor(text, t.role, t.weight),
    fontSize: t.fontSize,
    lineHeight: Math.round(t.lineHeight * (deva ? DEVA_LINE_BOOST : 1)),
    letterSpacing: deva ? undefined : t.letterSpacing,
    textTransform: t.textTransform,
    // The custom faces already carry their weight; leaving fontWeight unset
    // stops Android from synthesising a second, heavier fake-bold pass.
    ...(Platform.OS === 'android' ? {} : { fontWeight: String(t.weight) as TextStyle['fontWeight'] }),
  };
}
