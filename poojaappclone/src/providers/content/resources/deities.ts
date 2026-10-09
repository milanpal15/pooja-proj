import type { ImageSourcePropType } from 'react-native';

import type { CrownKind, Deity } from '@/constants/deities';

import type { RemoteDeity } from '../types';

/*
 * Turning dashboard rows into what the screens draw.
 *
 * The app's `Deity` and `Temple` carry rendering parameters the dashboard
 * may leave blank — a deity created there has a name long before anyone
 * picks its robe colour. These defaults are NOT content: they are how the
 * sanctum draws an unstyled record, and they apply whether or not demo
 * content is enabled. Falling back to a whole bundled *catalogue* is a
 * different thing, and that is what the flag controls.
 */
const DRAWN = {
  body: '#D9C7A7',
  robe: '#C8862F',
  accent: '#FFC13D',
  trim: '#E4572E',
  crown: 'plain' as CrownKind,
};

const CROWNS: CrownKind[] = ['jata', 'mukut', 'tall', 'plain'];
const asCrown = (v?: string): CrownKind =>
  CROWNS.includes(v as CrownKind) ? (v as CrownKind) : DRAWN.crown;

export function toDeity(r: RemoteDeity, art?: ImageSourcePropType): Deity {
  return {
    id: r.slug,
    name: r.name,
    title: r.title ?? r.name,
    body: r.body || DRAWN.body,
    robe: r.robe || DRAWN.robe,
    accent: r.accent || DRAWN.accent,
    trim: r.trim || DRAWN.trim,
    crown: asCrown(r.crown),
    crescent: r.crescent,
    serpent: r.serpent,
    elephant: r.elephant,
    mace: r.mace,
    image: art,
    mark: r.mark ?? '',
    mantra: r.mantra ?? '',
    offerings: r.offerings ?? [],
  };
}
