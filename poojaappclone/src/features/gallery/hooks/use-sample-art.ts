import { useContent } from '@/providers/content';

/**
 * A design-system showcase, so any published artwork will do — there is
 * no bundled still to reach for any more, and none is fine: ArchImage
 * renders its frame without one.
 */
export function useSampleArt() {
  const { deityArt, deityList } = useContent();
  return deityList.map((d) => deityArt(d.id)).find(Boolean);
}
