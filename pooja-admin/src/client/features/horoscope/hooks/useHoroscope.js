import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../../lib/api/index.js';
import { indexByDate } from '../lib/status.js';

/** Every reading, loaded once and indexed by day -> rashi. `rows === null` while loading. */
export function useHoroscope() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.horoscopes.list());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byDate = useMemo(() => indexByDate(rows), [rows]);

  return { rows, err, reload: load, byDate };
}
