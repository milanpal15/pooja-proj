import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { useLoad } from '@/hooks/use-load';
import { fetchBookings, fetchChadhavaOrders } from '@/lib/api';

/** Both lists. Re-read whenever the screen regains focus (after a cancel, a booking, a review). */
export function useMyBookings() {
  const poojas = useLoad(fetchBookings);
  const orders = useLoad(fetchChadhavaOrders);

  const first = useRef(true);
  const { reload: reloadPoojas } = poojas;
  const { reload: reloadOrders } = orders;
  useFocusEffect(
    useCallback(() => {
      // The mount already fetched; only refetch on the focus that follows a return.
      if (first.current) {
        first.current = false;
        return;
      }
      reloadPoojas();
      reloadOrders();
    }, [reloadPoojas, reloadOrders]),
  );

  return { poojas, orders };
}
