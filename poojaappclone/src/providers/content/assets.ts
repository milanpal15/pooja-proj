import type { ImageSourcePropType } from 'react-native';

import { ADMIN_API } from '@/constants/config';

import type { Content } from './types';

/**
 * Resolve a stored asset path against the backend. Uploaded files are stored
 * host-relative (`/uploads/x.png`) so the same value works from any host; older
 * absolute URLs are passed through unchanged.
 */
export function assetUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//.test(url) ? url : `${ADMIN_API}${url}`;
}

/** Deity artwork by slug, from the dashboard's `imageUrl` — undefined when none is uploaded. */
export function deityImageFor(imageBySlug: Map<string, string>, id: string): ImageSourcePropType | undefined {
  const url = assetUrl(imageBySlug.get(id));
  return url ? { uri: url } : undefined;
}

export function toneSound(content: Content, slug: string): { uri: string } | null {
  const sound = content.tones.find((t) => t.slug === slug)?.sound;
  // Only a real location is playable. Anything else — '', null, or a
  // leftover bundled name — has no file behind it.
  if (!sound || !/^(https?:\/\/|\/)/.test(sound)) return null;
  const url = assetUrl(sound);
  return url ? { uri: url } : null;
}
