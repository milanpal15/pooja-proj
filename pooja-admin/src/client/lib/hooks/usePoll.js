import { useCallback, useEffect, useState } from 'react';

/** Fetch now and then every `ms`. `{ data, err, reload }` — `data` is null until the first answer. */
export function usePoll(fn, deps = [], ms = 5000) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
    const id = setInterval(load, ms);
    return () => clearInterval(id);
  }, [load, ms]);
  return { data, err, reload: load };
}
