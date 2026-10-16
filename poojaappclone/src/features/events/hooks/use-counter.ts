import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, isOffline, postProgress, type ProgressResponse } from '@/lib/api';
import { useAuth } from '@/providers/auth';

import {
  applyOffline,
  applyRejected,
  applySuccess,
  applyTooFast,
  type CounterState,
  flushDelay,
  initCounter,
  MIN_GAP_MS,
  nextBatch,
  parseUnsent,
  shown,
  tap,
  unsent,
  unsentKey,
} from '../lib/counter-queue';

export type SaveStatus = 'idle' | 'saving' | 'offline' | 'rejected';

type Args = {
  slug: string;
  mKey: string;
  tKey: string;
  /** The server's count and target; null until the detail has loaded. */
  server: { count: number; target: number; done: boolean } | null;
  /** Every accepted response (including the one that completes the task). */
  onResponse: (res: ProgressResponse) => void;
  /** The server refused for good (locked, closed, not registered…). */
  onRejected: (status: number, code?: string) => void;
};

/**
 * The counter's engine. Taps are batched by `lib/counter-queue` and flushed:
 *  - ~700 ms after the last tap (never closer than the server's rate cap),
 *  - when the target is reached, when the screen loses focus, and when the app leaves the foreground.
 * Unsent taps are saved to AsyncStorage on every tap, so an app kill loses nothing; they are sent the
 * next time the counter opens. A 429 `too_fast` adopts the server's count.
 */
export function useCounter({ slug, mKey, tKey, server, onResponse, onRejected }: Args) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid ? unsentKey(uid, slug, mKey, tKey) : null;

  const [state, setState] = useState<CounterState | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const ref = useRef<CounterState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<number | null>(null);
  const alive = useRef(true);
  const handlers = useRef({ onResponse, onRejected });
  // A flush schedules the next one; going through a ref lets it name itself.
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    handlers.current = { onResponse, onRejected };
  });

  const commit = useCallback(
    (next: CounterState) => {
      ref.current = next;
      if (alive.current) setState(next);
      if (key) {
        const n = unsent(next);
        (n > 0 ? AsyncStorage.setItem(key, JSON.stringify({ pending: n })) : AsyncStorage.removeItem(key)).catch(() => {});
      }
    },
    [key],
  );

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    const cur = ref.current;
    if (!cur) return;
    const batch = nextBatch(cur);
    if (!batch) return;
    // A flush forced by blur / background must still keep clear of the server's rate cap.
    const wait = lastSent.current === null ? 0 : MIN_GAP_MS - (Date.now() - lastSent.current);
    commit(batch.state);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSent.current = Date.now();
    if (alive.current) setStatus('saving');
    try {
      const res = await postProgress(slug, mKey, tKey, { add: batch.add });
      const count = Number(res.task?.state?.count ?? 0);
      commit(applySuccess(ref.current ?? batch.state, count, !!res.task?.done));
      if (alive.current) setStatus('idle');
      handlers.current.onResponse(res);
    } catch (e) {
      const s = ref.current ?? batch.state;
      if (e instanceof ApiError && e.status === 429) {
        // Not an error for the devotee: adopt the server's state and carry on.
        const task = e.body?.task as { state?: { count?: number } } | undefined;
        commit(applyTooFast(s, task?.state?.count ?? s.confirmed));
        if (alive.current) setStatus('idle');
      } else if (isOffline(e) || (e instanceof ApiError && e.status >= 500)) {
        commit(applyOffline(s));
        if (alive.current) setStatus('offline');
        return;
      } else {
        commit(applyRejected(s));
        if (alive.current) setStatus('rejected');
        handlers.current.onRejected(e instanceof ApiError ? e.status : 0, e instanceof ApiError ? e.code : undefined);
        return;
      }
    }
    // Anything that piled up while the request was out goes next, spaced by the cap.
    const after = ref.current;
    if (after && alive.current && nextBatch(after)) {
      timer.current = setTimeout(() => void flushRef.current(), flushDelay(Date.now(), lastSent.current));
    }
  }, [slug, mKey, tKey, commit]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Start from the server's count plus anything saved by an earlier session.
  const target = server?.target ?? null;
  useEffect(() => {
    if (!server || !key || ref.current) return;
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => parseUnsent(raw))
      .catch(() => 0)
      .then((saved) => {
        if (cancelled || ref.current) return;
        commit(initCounter(server.count, server.target, saved, server.done));
        if (saved > 0 && !server.done) timer.current = setTimeout(() => void flush(), flushDelay(Date.now(), null));
      });
    return () => {
      cancelled = true;
    };
    // Only the first load seeds the counter; later server counts arrive through responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, key]);

  const press = useCallback(() => {
    const cur = ref.current;
    if (!cur) return;
    const next = tap(cur);
    if (next === cur) return;
    commit(next);
    if (shown(next) >= next.target) void flush();
    else {
      clearTimer();
      timer.current = setTimeout(() => void flush(), flushDelay(Date.now(), lastSent.current));
    }
  }, [commit, flush]);

  // Leaving the screen or the foreground sends what is waiting.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      return () => {
        void flush();
      };
    }, [flush]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flush();
    });
    return () => {
      sub.remove();
      alive.current = false;
      clearTimer();
    };
  }, [flush]);

  return { state, count: state ? shown(state) : (server?.count ?? 0), target: state?.target ?? server?.target ?? 0, done: !!state?.done, status, press, flush };
}
