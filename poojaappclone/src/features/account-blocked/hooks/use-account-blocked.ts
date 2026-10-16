import { useCallback, useEffect, useReducer, useRef } from 'react';

import { ApiError, syncProfile } from '@/lib/api';
import { isBlockCode, onBlockSignal } from '@/lib/api/block-signal';
import { useAuth } from '@/providers/auth';

import { blockReducer, classifyCheck, NO_BLOCK } from '../lib/blocked';

/**
 * The live block state. Any API call that answers `403 account_blocked|device_blocked` (including the
 * sign-in sync) switches it on through lib/api/block-signal; identical repeats do not re-render.
 *
 * `tryAgain` re-validates with the profile sync (authenticated, idempotent): a 2xx — or a 401, the
 * session is gone and they land on login — clears the block; a coded 403 keeps it ("still blocked");
 * anything else (offline, 5xx) keeps it with "could not check".
 */
export function useAccountBlocked() {
  const { signOut, refreshProfile } = useAuth();
  const [state, dispatch] = useReducer(blockReducer, NO_BLOCK);
  const running = useRef(false);

  useEffect(() => onBlockSignal((block) => dispatch({ type: 'blocked', block })), []);

  const tryAgain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    dispatch({ type: 'check_start' });
    try {
      let result: 'ok' | 'blocked' | 'error';
      try {
        await syncProfile({});
        result = classifyCheck({ ok: true });
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        result = classifyCheck({ ok: false, status, isBlock: e instanceof ApiError && status === 403 && isBlockCode(e.code) });
      }
      dispatch({ type: 'check_result', result });
      // The sync that cleared the block also holds the profile; pull it into the auth state.
      if (result === 'ok') void refreshProfile();
    } finally {
      running.current = false;
    }
  }, [refreshProfile]);

  const doSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      dispatch({ type: 'clear' });
    }
  }, [signOut]);

  return { state, tryAgain, signOut: doSignOut };
}
