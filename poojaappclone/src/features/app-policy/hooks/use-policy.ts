import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { apiFetch } from '@/lib/api/client';
import { onGateSignal } from '@/lib/api/gate-signal';
import { APP_PLATFORM, APP_VERSION_CODE, OS_API } from '@/lib/app-info';
import { getIdToken } from '@/lib/firebase-auth';

import {
  effectivePolicy,
  OK_POLICY,
  parsePolicy,
  type Policy,
  policyFromGateResponse,
  readCache,
  serializeCache,
  shouldRefetch,
} from '../lib/policy';

const CACHE_KEY = 'bhakti.appPolicy.v1';
const TIMEOUT_MS = 6_000;

/** `GET /api/app/policy?platform=&versionCode=&osApi=` — null on any failure (the caller keeps what it has). */
async function fetchPolicy(signedIn: boolean): Promise<Policy | null> {
  const qs = [`platform=${encodeURIComponent(APP_PLATFORM)}`];
  if (APP_VERSION_CODE != null) qs.push(`versionCode=${APP_VERSION_CODE}`);
  if (OS_API != null) qs.push(`osApi=${OS_API}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // The token is optional (it only lets the server honour the maintenance allow-list and tie the device
    // to a user); never wait long for it and never fail because of it.
    let token: string | null = null;
    if (signedIn) {
      token = await Promise.race([getIdToken(false).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_000))]);
    }
    const res = await apiFetch(`/api/app/policy?${qs.join('&')}`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    // A garbled body is "ok" (parsePolicy), not a failure: fail open.
    const body: unknown = await res.json().catch(() => null);
    return parsePolicy(body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The live policy. NEVER throws and never delays rendering: it starts as `ok`, fills from the cache a
 * moment later, then from the network. Checked at launch, on every return to the foreground (at most
 * every 10 min), when the signed-in user changes, on Retry, and instantly when ANY API call answers
 * `426 app_outdated` / `503 maintenance` (lib/api/gate-signal).
 */
export function usePolicy(uid: string | null) {
  const [state, setState] = useState<{ policy: Policy; at: number }>({ policy: OK_POLICY, at: 0 });
  const setPolicy = useCallback((policy: Policy) => setState({ policy, at: Date.now() }), []);
  const [checking, setChecking] = useState(false);
  const lastAttempt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const uidRef = useRef(uid);
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);
  // Once a network answer (or a gate signal) has landed, a slow cache read must not overwrite it.
  const live = useRef(false);

  const check = useCallback(async (force = false) => {
    const now = Date.now();
    if (inFlight.current || !shouldRefetch(lastAttempt.current, now, force)) return;
    inFlight.current = true;
    lastAttempt.current = now;
    setChecking(true);
    try {
      const fresh = await fetchPolicy(!!uidRef.current);
      if (!fresh) return; // unreachable: keep the current answer / the cache
      live.current = true;
      setPolicy(effectivePolicy(fresh, Date.now()));
      if (!fresh.degraded) AsyncStorage.setItem(CACHE_KEY, serializeCache(fresh, Date.now())).catch(() => {});
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [setPolicy]);

  // Cache first (instant, offline-safe), network right after.
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        const cached = readCache(raw, Date.now());
        if (cached && !live.current) setPolicy(cached);
      })
      .catch(() => {});
    void check(true);
  }, [check, setPolicy]);

  // Signing in/out changes who the server sees (allow-list, device->user link).
  const firstUid = useRef(true);
  useEffect(() => {
    if (firstUid.current) {
      firstUid.current = false;
      return;
    }
    void check(true);
  }, [uid, check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check(false);
    });
    return () => sub.remove();
  }, [check]);

  // Any 426 / 503-maintenance from any call switches the gate at once.
  useEffect(
    () =>
      onGateSignal(({ httpStatus, body }) => {
        const p = policyFromGateResponse(httpStatus, body);
        if (!p) return;
        live.current = true;
        setPolicy(p);
      }),
    [setPolicy],
  );

  return { policy: state.policy, /** When this answer arrived (ms) — the gate's clock for snoozes. */ at: state.at, checking, retry: () => check(true) };
}
