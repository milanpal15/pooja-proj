import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';

import { todayKey } from '../lib/today-key';
import type { Reading } from '../types';

/** Today's published readings; `failed` tells "could not reach" apart from "nothing published". */
export function useReadings() {
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    apiRequest<{ readings?: Reading[] }>(`/api/horoscope?date=${todayKey()}`, { signal: controller.signal, timeout: 8000 })
      .then((r) => (r.ok && r.data && typeof r.data === 'object' ? r.data : Promise.reject(new Error(String(r.status)))))
      .then((data: { readings?: Reading[] }) => {
        if (alive) setReadings(data.readings ?? []);
      })
      .catch(() => {
        // Offline or no backend. Distinguished from "published nothing" so
        // the screen can say which, instead of blaming the temple.
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  return { readings, failed };
}
