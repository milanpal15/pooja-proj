import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { type Astrologer, ApiError, createCall } from '@/lib/api';
import { uuid } from '@/lib/uuid';

/**
 * Create a call and open its screen.
 *
 * One `requestId` per tap-and-its-retries: it is generated the first time and
 * reused if the request fails in a way that might have reached the server
 * (timeout, dropped connection), so a retry can never create a second call.
 * Any definite server answer ends that attempt and the next tap gets a new id.
 */
export function useStartCall({
  onInsufficient,
  onStarted,
}: {
  onInsufficient: (shortfall: number | undefined) => void;
  onStarted?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [starting, setStarting] = useState(false);
  const pending = useRef<{ astrologerId: string; requestId: string } | null>(null);
  const busy = useRef(false);

  const start = useCallback(
    async (a: Astrologer) => {
      if (busy.current) return;
      busy.current = true;
      setStarting(true);
      if (pending.current?.astrologerId !== a.id) {
        pending.current = { astrologerId: a.id, requestId: uuid() };
      }
      try {
        const call = await createCall(a.id, pending.current.requestId);
        pending.current = null;
        onStarted?.();
        router.push(`/call/${call.id}` as never);
      } catch (e) {
        if (e instanceof ApiError && e.status > 0 && e.status !== 408) {
          pending.current = null; // a definite answer — next tap is a new request
          if (e.code === 'insufficient_coins') {
            const s = e.body?.shortfall;
            onInsufficient(typeof s === 'number' ? s : undefined);
          } else if (e.code === 'astrologer_unavailable') toast.error(t('call_err_unavailable'));
          else if (e.code === 'already_in_call') toast.error(t('call_err_in_call'));
          else if (e.code === 'calls_disabled') toast.error(t('call_err_disabled'));
          else if (e.code === 'calls_unavailable') toast.error(t('call_err_unavail_srv'));
          else toast.error(t('call_err_generic'));
        } else {
          // Network failure: keep the requestId, the call may exist already.
          toast.error(t('call_err_offline'));
        }
      } finally {
        busy.current = false;
        setStarting(false);
      }
    },
    [router, toast, t, onInsufficient, onStarted],
  );

  return { start, starting };
}
