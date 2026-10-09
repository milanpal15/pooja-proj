import { useCallback, useEffect, useState } from 'react';

import { type Earnings, fetchMyEarnings } from '@/lib/api';

export function useAstrologerEarnings() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setEarnings(await fetchMyEarnings());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(refresh, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  return { earnings, loading, error, refresh };
}
