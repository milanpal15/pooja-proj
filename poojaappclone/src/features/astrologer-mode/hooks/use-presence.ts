import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, fetchAstrologerMe, sendHeartbeat, setMyPresence } from '@/lib/api';

import { useAppActive } from './use-app-active';

const HEARTBEAT_MS = 20_000;

export type ToggleResult = 'ok' | 'on_call' | 'failed';

/**
 * The astrologer's availability: the Online switch plus the heartbeat that
 * keeps the server from treating them as offline (it expires presence after
 * 45 s of silence). The heartbeat only runs while online AND foregrounded —
 * a backgrounded app cannot take a call anyway, so it must not claim to.
 */
export function usePresence() {
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const active = useAppActive();
  const onlineRef = useRef(false);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const load = useCallback(async () => {
    try {
      const me = await fetchAstrologerMe();
      setOnline(me.presence !== 'offline');
      setBusy(me.presence === 'busy');
      setRate(me.ratePerMin ?? null);
    } catch {
      // keep whatever we had; the switch stays usable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  // Heartbeat.
  useEffect(() => {
    if (!online || !active) return;
    sendHeartbeat().catch(() => {});
    const id = setInterval(() => sendHeartbeat().catch(() => {}), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [online, active]);

  const toggle = useCallback(async (next: boolean): Promise<ToggleResult> => {
    setToggling(true);
    try {
      const p = await setMyPresence(next);
      setOnline(p !== 'offline');
      setBusy(p === 'busy');
      return 'ok';
    } catch (e) {
      return e instanceof ApiError && e.status === 409 ? 'on_call' : 'failed';
    } finally {
      setToggling(false);
    }
  }, []);

  /** Best-effort: used on sign-out and when leaving astrologer mode. */
  const goOffline = useCallback(async () => {
    if (!onlineRef.current) return;
    onlineRef.current = false;
    setOnline(false);
    await setMyPresence(false).catch(() => {});
  }, []);

  return { online, busy, rate, loading, toggling, toggle, goOffline, reload: load };
}
