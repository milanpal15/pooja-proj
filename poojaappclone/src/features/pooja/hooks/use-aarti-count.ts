import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { TOTAL_AARTIS_KEY } from '../constants/orbit';

/** Persisted total aarti completion count (the "coin" counter). */
export function useAartiCount() {
  const [totalAartis, setTotalAartis] = useState(0);

  // Load the persisted aarti counter on mount.
  useEffect(() => {
    AsyncStorage.getItem(TOTAL_AARTIS_KEY)
      .then((raw) => { if (raw) setTotalAartis(parseInt(raw, 10) || 0); })
      .catch(() => {});
  }, []);

  /** Increment and persist the aarti completion counter. */
  const countCompleted = useCallback(() => {
    setTotalAartis((prev) => {
      const next = prev + 1;
      AsyncStorage.setItem(TOTAL_AARTIS_KEY, String(next)).catch(() => {});
      return next;
    });
  }, []);

  return { totalAartis, countCompleted };
}
