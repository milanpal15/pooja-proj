import { useCallback, useEffect, useState } from 'react';

import { loadNotifications } from '../lib/notifications';

/** Whether this build can post notifications, and whether the devotee allowed them. */
export function useReminderPermission() {
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  /** Whether this build can schedule notifications at all. */
  const [supported, setSupported] = useState<'unknown' | 'yes' | 'no'>('unknown');

  useEffect(() => {
    loadNotifications().then(async (N) => {
      if (!N) {
        setSupported('no');
        return;
      }
      setSupported('yes');
      try {
        const p = await N.getPermissionsAsync();
        setPermission(p.granted ? 'granted' : 'denied');
      } catch {
        setPermission('denied');
      }
    });
  }, []);

  /** Ask only when the devotee turns something on, never on mount. */
  const ensurePermission = useCallback(async () => {
    const N = await loadNotifications();
    if (!N) return false;
    const current = await N.getPermissionsAsync();
    if (current.granted) {
      setPermission('granted');
      return true;
    }
    const asked = await N.requestPermissionsAsync();
    setPermission(asked.granted ? 'granted' : 'denied');
    return asked.granted;
  }, []);

  return { permission, supported, ensurePermission };
}
