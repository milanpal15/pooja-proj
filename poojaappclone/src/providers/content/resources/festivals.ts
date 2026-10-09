import { type Festival, FESTIVALS } from '@/constants/festivals';

import type { RemoteFestival } from '../types';

/** Today in LOCAL time as `YYYY-MM-DD` — `toISOString()` would shift the day. */
function todayKey() {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

function filterUpcoming(list: Festival[], limit: number): Festival[] {
  const today = todayKey();
  return list
    .filter((f) => f.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function upcomingFestivals(festivals: RemoteFestival[], limit: number): Festival[] {
  const remote: Festival[] = festivals.map((f) => ({
    id: f.slug,
    name: f.name,
    nameHi: f.nameHi || f.name,
    date: f.date,
    deity: f.deitySlug || 'shiva',
  }));
  const fromRemote = filterUpcoming(remote, limit);
  return fromRemote.length ? fromRemote : filterUpcoming(FESTIVALS, limit);
}
