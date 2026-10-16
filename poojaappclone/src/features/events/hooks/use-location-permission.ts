import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

export type LocationPermission = 'unknown' | 'undetermined' | 'granted' | 'denied';

/**
 * Foreground location permission for Yatra check-ins — never background, never a device-wide setting.
 *
 * Nothing is asked on mount. `ensure()` is what a "Check in" press calls: it opens the app's own
 * rationale sheet first (`rationaleOpen`), and only its "Allow" button raises the system prompt
 * (`confirm`). A denial that Android will not re-ask (`canAskAgain` false) is resolved with
 * `openSettings()` — this app's page in system settings, nothing wider. The state is re-read whenever
 * the app comes back to the foreground (the devotee may have changed it in settings).
 */
export function useLocationPermission(active: boolean) {
  const [status, setStatus] = useState<LocationPermission>('unknown');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const apply = useCallback((p: Location.PermissionResponse): LocationPermission => {
    const next: LocationPermission = p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
    setStatus(next);
    setCanAskAgain(p.canAskAgain !== false);
    return next;
  }, []);

  const read = useCallback(async (): Promise<LocationPermission> => {
    try {
      return apply(await Location.getForegroundPermissionsAsync());
    } catch {
      return 'undetermined';
    }
  }, [apply]);

  // Re-read whenever the screen comes (back) to the foreground.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (alive) apply(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [active, apply]);

  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );

  /** Resolves true when permission is (or becomes) granted. False: refused, dismissed or unavailable. */
  const ensure = useCallback(async (): Promise<boolean> => {
    const now = await read();
    if (now === 'granted') return true;
    if (now === 'denied') {
      // Re-read canAskAgain from the OS (state may not have flushed yet).
      const p = await Location.getForegroundPermissionsAsync().catch(() => null);
      if (!p || p.canAskAgain === false) return false;
    }
    return new Promise<boolean>((resolve) => {
      pending.current?.(false);
      pending.current = resolve;
      setRationaleOpen(true);
    });
  }, [read]);

  const settle = (ok: boolean) => {
    const r = pending.current;
    pending.current = null;
    r?.(ok);
  };

  const confirm = useCallback(async () => {
    setRationaleOpen(false);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      setStatus(p.granted ? 'granted' : 'denied');
      setCanAskAgain(p.canAskAgain !== false);
      settle(p.granted);
    } catch {
      settle(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setRationaleOpen(false);
    settle(false);
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {});
  }, []);

  return { status, canAskAgain, rationaleOpen, ensure, confirm, dismiss, openSettings } as const;
}

export type LocationPermissionController = ReturnType<typeof useLocationPermission>;
