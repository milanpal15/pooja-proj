import type { Astrologer } from '@/lib/api';

/** `all`, `online`, or `spec:<speciality>`. */
export type AstrologerFilter = string;

/** Distinct specialities, most common first — derived from the data, never hardcoded. */
export function specialitiesOf(list: Astrologer[]): string[] {
  const count = new Map<string, number>();
  for (const a of list) for (const s of a.specialities ?? []) count.set(s, (count.get(s) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

export function applyFilter(list: Astrologer[], filter: AstrologerFilter, query: string): Astrologer[] {
  const q = query.trim().toLowerCase();
  return list
    .filter((a) => {
      if (filter === 'online') return a.presence === 'online';
      if (filter.startsWith('spec:')) return a.specialities?.includes(filter.slice(5));
      return true;
    })
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.specialities?.some((s) => s.toLowerCase().includes(q)) ||
        a.languages?.some((l) => l.toLowerCase().includes(q)),
    )
    // Reachable people first: online, then busy, then offline.
    .sort((a, b) => rank(a) - rank(b));
}

const rank = (a: Astrologer) => (a.presence === 'online' ? 0 : a.presence === 'busy' ? 1 : 2);
