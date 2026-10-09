import { useEffect, useState } from 'react';

/** Seconds until the OTP may be re-sent. `start(n)` begins an n-second countdown. */
export function useResendCountdown() {
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  return { resendIn, start: setResendIn };
}
