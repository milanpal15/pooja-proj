import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/providers/auth';
import { useWallet } from '@/features/wallet';
import { type CallView, cancelCall, endCall, fetchCall } from '@/lib/api';
import { secondsSince } from '@/lib/duration';

const POLL_MS = 2_500;

export type CallPhase = 'loading' | 'ringing' | 'connected' | 'ended' | 'error';

/**
 * Follows one call from the server's point of view.
 *
 * The phone never decides status, cost or balance: it polls `GET /calls/:id`
 * every 2.5 s and renders what it is told. A failed poll keeps the last known
 * state (`offline` goes true) rather than inventing an ending. Polling stops
 * once the call has ended, and the wallet is refreshed exactly once then.
 */
export function useCallSession(id: string | undefined) {
  const { refresh: refreshWallet } = useWallet();
  const { user, devoteeView } = useAuth();
  const isAstrologer = user?.role === 'astrologer' && !devoteeView;

  const [call, setCall] = useState<CallView | null>(null);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const walletRefreshed = useRef(false);
  const hasCall = useRef(false);
  const ended = call?.status === 'ended';

  const poll = useCallback(async () => {
    if (!id) return;
    try {
      const next = await fetchCall(id);
      hasCall.current = true;
      setCall(next);
      setError(false);
      setOffline(false);
    } catch {
      // No call yet -> nothing to show; otherwise keep what we have.
      if (hasCall.current) setOffline(true);
      else setError(true);
    }
  }, [id]);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    if (ended) return () => clearTimeout(first);
    const t = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [poll, ended]);

  // One-second tick for the on-screen timer only while connected.
  const connected = call?.status === 'connected';
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [connected]);

  useEffect(() => {
    if (ended && !walletRefreshed.current) {
      walletRefreshed.current = true;
      refreshWallet();
    }
  }, [ended, refreshWallet]);

  const phase: CallPhase = error
    ? 'error'
    : !call
      ? 'loading'
      : call.status === 'requested'
        ? 'ringing'
        : call.status === 'connected'
          ? 'connected'
          : 'ended';

  const elapsed = call?.answeredAt
    ? call.status === 'ended'
      ? Math.max(0, Math.floor((Date.parse(call.endedAt ?? '') - Date.parse(call.answeredAt)) / 1000) || 0)
      : secondsSince(call.answeredAt, now)
    : 0;

  const cancel = useCallback(async () => {
    if (!id) return;
    try {
      await cancelCall(id);
    } finally {
      await poll();
    }
  }, [id, poll]);

  const end = useCallback(async () => {
    if (!id) return;
    try {
      await endCall(id);
    } finally {
      await poll();
    }
  }, [id, poll]);

  return { call, phase, elapsed, offline, isAstrologer, cancel, end, retry: poll };
}
