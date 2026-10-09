import { useEffect, useState } from 'react';

import { ADMIN_API } from '@/constants/config';

import { todayKey } from '../lib/today-key';
import type { Reading } from '../types';

/** Today's published readings; `failed` tells "could not reach" apart from "nothing published". */
export function useReadings() {
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`${ADMIN_API}/api/horoscope?date=${todayKey()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { readings?: Reading[] }) => {
        if (alive) setReadings(data.readings ?? []);
      })
      .catch(() => {
        // Offline or no backend. Distinguished from "published nothing" so
        // the screen can say which, instead of blaming the temple.
        if (alive) setFailed(true);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return { readings, failed };
}
