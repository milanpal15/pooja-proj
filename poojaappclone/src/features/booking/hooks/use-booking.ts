import { useCallback } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchBooking } from '@/lib/api';

export function useBooking(id: string) {
  const load = useCallback(() => fetchBooking(id), [id]);
  return useLoad(load);
}
