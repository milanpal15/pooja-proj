import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { Temple } from '@/constants/temples';

/** Open the aarti experience for a temple's deity (shared by the illustrated and the live map). */
export function usePerformPooja() {
  const router = useRouter();
  return useCallback(
    (s: Temple) =>
      router.push({
        pathname: '/pooja',
        // `ts` is a nonce so re-selecting the same deity still restarts
        // the aarti (identical params would otherwise skip the reset).
        params: { deity: s.deity, ts: String(Date.now()) },
      }),
    [router],
  );
}
