import type { Deity } from '@/constants/deities';
import type { Temple } from '@/constants/temples';

import type { RemoteTemple } from '../types';

import { toDeity } from './deities';

const TEMPLE_DRAWN = {
  backdrop: ['#2A1206', '#120703'] as [string, string],
  accent: '#FFC13D',
  trim: '#E4572E',
  idol: '#D9C7A7',
};

function toTemple(r: RemoteTemple, deity: Deity): Temple {
  return {
    id: r.slug,
    name: r.name,
    // The slug, not the deity object: `Temple.deity` is a reference, and
    // every consumer wanted the slug back out of it.
    deity: deity.id,
    mark: r.mark || deity.mark,
    location: r.location ?? '',
    aarti: r.aartiTime ?? '',
    offerings: r.offerings ?? [],
    backdrop: [
      r.backdropFrom || TEMPLE_DRAWN.backdrop[0],
      r.backdropTo || TEMPLE_DRAWN.backdrop[1],
    ],
    accent: r.accent || deity.accent || TEMPLE_DRAWN.accent,
    trim: r.trim || TEMPLE_DRAWN.trim,
    idol: r.idol || TEMPLE_DRAWN.idol,
    map: { x: r.mapX ?? 0, y: r.mapY ?? 0 },
    coords: { lat: r.lat ?? 0, lng: r.lng ?? 0 },
  };
}

export function buildTempleList(
  temples: RemoteTemple[],
  deityList: Deity[],
  deityBySlug: Map<string, Deity>,
): Temple[] {
  return temples.map((t) =>
    toTemple(
      t,
      // A temple needs a deity to borrow its colours and mark from.
      (t.deitySlug && deityBySlug.get(t.deitySlug)) ||
        deityList[0] ||
        toDeity({ slug: t.deitySlug ?? '', name: '' }),
    ),
  );
}

export function templeRatingFor(templeBySlug: Map<string, RemoteTemple>, slug: string) {
  const tpl = templeBySlug.get(slug);
  if (typeof tpl?.rating !== 'number' || tpl.rating <= 0) return undefined;
  return { rating: tpl.rating, reviews: tpl.reviews };
}
