import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { RASHI_STORAGE_KEY, RASHIS } from '../constants/rashis';

/** The devotee's chosen sign, remembered between visits. */
export function useRashi() {
  const [rashi, setRashi] = useState(RASHIS[0].id);

  // Remember the devotee's sign between visits.
  useEffect(() => {
    AsyncStorage.getItem(RASHI_STORAGE_KEY)
      .then((v) => {
        if (v && RASHIS.some((r) => r.id === v)) setRashi(v);
      })
      .catch(() => {});
  }, []);

  const pick = useCallback((id: string) => {
    setRashi(id);
    AsyncStorage.setItem(RASHI_STORAGE_KEY, id).catch(() => {});
  }, []);

  const current = useMemo(() => RASHIS.find((r) => r.id === rashi)!, [rashi]);

  return { rashi, pick, current };
}
