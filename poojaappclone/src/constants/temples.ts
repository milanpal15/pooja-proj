/**
 * Temple catalogue for the selection carousel and the pooja screen.
 *
 * Each temple carries its own palette so the whole screen re-themes as the
 * user swipes between them.
 */

/**
 * Which deity a temple is dedicated to, as the deity's slug.
 *
 * This was a display label ('Shiva' | 'Ganesha' | 'Devi' | 'Vishnu'), which
 * made it a lossy encoding of the slug every consumer actually wanted:
 * `booking.tsx` recovered one with `.toLowerCase()`, and 'Ganesha' lowercases
 * to `ganesha`, which matches no deity — so its seva lookup silently found
 * nothing. The slug is the real value; screens look the display name up.
 */
export type DeitySlug = string;

export type Temple = {
  id: string;
  name: string;
  deity: DeitySlug;
  /** Short devanagari mark drawn on the idol's halo. */
  mark: string;
  location: string;
  aarti: string;
  offerings: string[];
  /** Background wash, from top to bottom. */
  backdrop: [string, string];
  /** Primary accent — used for the halo, flame glow and buttons. */
  accent: string;
  /** Secondary accent for garlands and trim. */
  trim: string;
  /** Idol body / stone tone. */
  idol: string;
  /** Position on the pilgrimage map canvas, roughly following real geography. */
  map: { x: number; y: number };
  /** Real-world position — drives "near me" distance, and a native map later. */
  coords: { lat: number; lng: number };
};

/** Size of the scrollable map canvas the temple markers are placed on. */
export const MAP_W = 620;
export const MAP_H = 900;

/** Number of full circles that completes one aarti. */
