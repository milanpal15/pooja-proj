import type { Track, TrackKind } from '../types';
import { trackKind } from './kind';

export const TOP_N = 20;

export type ShelfFilter = {
  /** '' = the "Top 20" chip (no deity filter). */
  deity: string;
  kind: TrackKind | '';
  favouritesOnly: boolean;
  favourites: string[];
};

/** Narrow the shelf. "Top 20" caps at 20 only when no other filter is active. */
export function filterTracks(tracks: Track[], f: ShelfFilter): Track[] {
  let out = tracks;
  if (f.favouritesOnly) out = out.filter((t) => f.favourites.includes(t.id));
  if (f.deity) out = out.filter((t) => t.deity === f.deity);
  if (f.kind) out = out.filter((t) => trackKind(t) === f.kind);
  return !f.deity && !f.kind && !f.favouritesOnly ? out.slice(0, TOP_N) : out;
}

/** Deity slugs that actually have a track, in first-seen order — empty chips are hidden. */
export function deitiesPresent(tracks: Track[]): string[] {
  const seen: string[] = [];
  for (const t of tracks) if (t.deity && !seen.includes(t.deity)) seen.push(t.deity);
  return seen;
}
