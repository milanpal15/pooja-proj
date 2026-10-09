import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type CallView, fetchIncomingCall } from '@/lib/api';

import { useAppActive } from './use-app-active';

const POLL_MS = 3_000;

export type Incoming = { call: CallView; arrivedAt: number };

/**
 * Poll for a `requested` call while online and foregrounded; when a new one
 * arrives, open the incoming screen once.
 *
 * Limitation (by design for now): this is foreground polling. With the app in
 * the background or killed there is no ring — that needs FCM push, which is
 * not wired. The Online card says to keep the app open.
 */
export function useIncomingCall(enabled: boolean) {
  const router = useRouter();
  const active = useAppActive();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const handled = useRef(new Set<string>());
  const currentId = useRef<string | null>(null);

  /** Mark a call as dealt with so the next poll does not re-open it. */
  const resolve = useCallback((id: string) => {
    handled.current.add(id);
    if (currentId.current === id) currentId.current = null;
    setIncoming((cur) => (cur?.call.id === id ? null : cur));
  }, []);

  useEffect(() => {
    if (!enabled || !active) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const call = await fetchIncomingCall();
        if (cancelled) return;
        if (!call) {
          currentId.current = null;
          setIncoming(null);
          return;
        }
        if (handled.current.has(call.id) || currentId.current === call.id) return;
        currentId.current = call.id;
        setIncoming({ call, arrivedAt: Date.now() });
        router.push('/incoming-call' as never);
      } catch {
        // transient: try again next tick
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, active, router]);

  return { incoming, resolve };
}
