import type { Seva } from '@/constants/poojas';

import type { RemoteSeva } from '../types';

export function sevasFor(
  sevas: RemoteSeva[],
  { templeSlug, deitySlug }: { templeSlug?: string; deitySlug?: string },
): Seva[] {
  const remote = sevas
    .filter((s) => !s.templeSlug || s.templeSlug === templeSlug)
    .filter((s) => !s.deitySlugs?.length || (!!deitySlug && s.deitySlugs.includes(deitySlug)))
    .map<Seva>((s) => ({
      id: s.slug,
      name: s.name,
      nameHi: s.nameHi || s.name,
      description: s.description || '',
      price: s.price,
      duration: s.duration || '',
    }));
  return remote;
}
