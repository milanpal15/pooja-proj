import { useEffect, useState } from 'react';

/** A clock that ticks every `ms`, so a countdown re-renders without each widget owning a timer. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
