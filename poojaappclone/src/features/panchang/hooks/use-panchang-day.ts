import { useCallback, useEffect, useMemo, useState } from 'react';

import { ADMIN_API } from '@/constants/config';
import { computePanchang } from '@/lib/panchang';

import { dayKey } from '../lib/day-key';

/**
 * The panchang for the day on screen: computed on the device, with the
 * temple's per-date override from the dashboard merged field by field.
 */
export function usePanchangDay(place: { lat: number; lng: number }, hi: boolean) {
  const [offset, setOffset] = useState(0);

  /*
   * Per-date override from the dashboard; null means "use the computed value".
   *
   * Stored with the date it belongs to rather than cleared when the date
   * changes: resetting it in the effect body is a synchronous setState that
   * cascades a render, and stamping it means yesterday's override can never
   * flash over today's numbers while the new fetch is in flight.
   */
  const [fetched, setFetched] = useState<{ key: string; data: Record<string, string> | null }>({
    key: '',
    data: null,
  });

  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }, [offset]);

  const p = useMemo(
    () => computePanchang(date, place.lat, place.lng),
    [date, place.lat, place.lng],
  );

  // Best-effort, like every other content call: no backend just means the
  // device's own numbers stand.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const key = dayKey(date);

    fetch(`${ADMIN_API}/api/panchang?date=${key}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { override?: Record<string, string> | null }) => {
        if (alive) setFetched({ key, data: d.override ?? null });
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => {
      alive = false;
      controller.abort();
    };
  }, [date]);

  /** Only trust the override if it was fetched for the date on screen. */
  const override = fetched.key === dayKey(date) ? fetched.data : null;

  /** Temple's value when published, else the computed one. */
  const show = useCallback(
    (k: string, fallback: string) => override?.[k] || fallback,
    [override],
  );
  const overridden = !!override;

  /** The computed value in the devotee's own script. */
  const own = useCallback(
    (en: string, dev: string) => (hi ? dev || en : en),
    [hi],
  );

  return { offset, setOffset, date, p, override, overridden, show, own };
}
