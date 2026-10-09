import type { Track } from '../types';

/**
 * "Today's mantra": one track, the same all day, a different one tomorrow.
 * Tracks that can actually play are preferred; none at all means no banner
 * (the caller hides it) — nothing is made up.
 */
export function todaysPick(tracks: Track[], today: Date): Track | undefined {
  const pool = tracks.some((t) => t.url) ? tracks.filter((t) => t.url) : tracks;
  if (pool.length === 0) return undefined;
  const start = new Date(today.getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((today.getTime() - start) / 86_400_000);
  return pool[dayOfYear % pool.length];
}
