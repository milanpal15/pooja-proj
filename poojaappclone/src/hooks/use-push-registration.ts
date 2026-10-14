import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { loadPushModule, registerForPush, watchPushToken } from '@/lib/push';
import { routeForNotification } from '@/lib/push-logic';

/**
 * Keeps this phone registered for push while someone is signed in, and opens the right screen when a notification is tapped
 * (including the tap that cold-started the app).
 *
 * `astrologer` decides what an incoming-call notification opens: the astrologer's home, where the ringing call is waiting.
 */
export function usePushRegistration({ uid, astrologer }: { uid: string | null; astrologer: boolean }) {
  const router = useRouter();
  const astrologerRef = useRef(astrologer);
  useEffect(() => {
    astrologerRef.current = astrologer;
  }, [astrologer]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let stopWatching: (() => void) | undefined;
    registerForPush(uid).then(() => {
      if (!cancelled) watchPushToken(uid).then((stop) => (cancelled ? stop() : (stopWatching = stop)));
    });
    return () => {
      cancelled = true;
      stopWatching?.();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    let remove: (() => void) | undefined;
    const open = (data: unknown) => {
      const to = routeForNotification(data, { astrologer: astrologerRef.current });
      if (to) router.push(to as never);
    };
    loadPushModule().then((N) => {
      if (!N || cancelled) return;
      const sub = N.addNotificationResponseReceivedListener((r: { notification?: { request?: { content?: { data?: unknown } } } }) =>
        open(r?.notification?.request?.content?.data),
      );
      remove = () => sub.remove();
      // The tap that launched the app from a closed state arrives before any listener could be attached.
      const last = N.getLastNotificationResponse?.();
      if (last) {
        open(last.notification?.request?.content?.data);
        N.clearLastNotificationResponse?.();
      }
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [uid, router]);
}
