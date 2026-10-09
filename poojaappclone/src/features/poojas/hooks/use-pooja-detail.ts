import { useCallback } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchPooja } from '@/lib/api';

export function usePoojaDetail(slug: string) {
  const load = useCallback(() => fetchPooja(slug), [slug]);
  return useLoad(load);
}
