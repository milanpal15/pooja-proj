import { useCallback, useState } from 'react';

import type { AuthErrors } from './use-auth-errors';

/**
 * Run one async sign-in step: busy on, last error cleared, failures shown.
 *
 * No `isMounted` guard: the screen can unmount at any moment (SMS Retriever
 * auto-verify, or the gate swapping it out once `user` appears) and a
 * `setBusy(false)` after that is a harmless no-op.
 */
export function useAuthAction({ resetError, show }: AuthErrors) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      resetError();
      try {
        await action();
      } catch (e) {
        show(e);
      } finally {
        setBusy(false);
      }
    },
    [resetError, show],
  );

  return { busy, run };
}

export type AuthAction = ReturnType<typeof useAuthAction>;
