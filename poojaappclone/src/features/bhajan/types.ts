/**
 * A track, as the shelf renders it.
 *
 * The six tracks used to be a literal in the screen while the dashboard
 * managed six aartis of its own — two lists, neither visible to the other,
 * and the one an operator could edit was the one nobody saw.
 */
export type Track = {
  id: string;
  title: string;
  artist: string;
  len: string;
  /** The dashboard's own shelf label (morning | evening | meditation); not the tile kind. */
  category: string;
  /** Deity slug from the dashboard, '' when none. */
  deity: string;
  /** The track's own recording, or undefined if none has been uploaded. */
  url?: string;
};

/** The five tiles. Derived from what each track says about itself — see `lib/kind.ts`. */
export type TrackKind = 'aarti' | 'bhajan' | 'chalisa' | 'mantra' | 'paath';
