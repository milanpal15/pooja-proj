import { useCallback, useRef, useState } from 'react';

import { useConfirm, useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { ApiError, type EventDetail, type EventMe, isOffline, joinEvent, leaveEvent } from '@/lib/api';
import { createRequestKeeper } from '@/lib/request-key';
import { uuid } from '@/lib/uuid';
import { useAuth } from '@/providers/auth';

import { cancelEventReminder } from '../lib/event-reminders';
import { type JoinFailure, joinFailure } from '../lib/registration';

/**
 * Joining and leaving. Nothing is optimistic: the pass appears only once the server has answered.
 * The `requestId` is kept across retries of the SAME answers (a dropped connection may have reached
 * the server) and cleared on any definitive answer.
 */
export function useJoin(event: EventDetail, setMe: (me: EventMe | null) => void, reload: () => void) {
  const { t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const keeper = useRef(createRequestKeeper(uuid)).current;

  /** Resolves `null` on success, else what went wrong (the caller shows it inside its sheet). */
  const join = useCallback(
    async (answers: Record<string, string | number>): Promise<JoinFailure | null> => {
      if (!user) return joinFailure(401);
      setBusy(true);
      try {
        const res = await joinEvent(event.slug, keeper.idFor(JSON.stringify(answers)), Object.keys(answers).length ? answers : undefined);
        keeper.clear();
        setMe(res.me ?? { ...(event.me ?? {}), registered: true, passCode: res.registration.passCode ?? null, answers: res.registration.answers });
        reload();
        return null;
      } catch (e) {
        if (isOffline(e)) return joinFailure(0);
        keeper.clear();
        const f = e instanceof ApiError ? joinFailure(e.status, e.code, e.body) : joinFailure(500);
        if (f.reload) reload();
        return f;
      } finally {
        setBusy(false);
      }
    },
    [user, event.slug, event.me, keeper, setMe, reload],
  );

  const leave = useCallback(async () => {
    const yes = await confirm({
      title: t('ev_leave_title'),
      message: t('ev_leave_body'),
      confirmLabel: t('ev_leave_yes'),
      cancelLabel: t('ev_leave_keep'),
      destructive: true,
    });
    if (!yes) return;
    setBusy(true);
    try {
      await leaveEvent(event.slug);
      void cancelEventReminder(event.slug);
      setMe({ ...(event.me ?? {}), registered: false, passCode: null });
      toast.success(t('ev_left_toast'));
      reload();
    } catch {
      toast.error(t('ev_leave_failed'));
      reload(); // the start may have passed: show the server's view
    } finally {
      setBusy(false);
    }
  }, [confirm, t, event.slug, event.me, setMe, toast, reload]);

  return { join, leave, busy, signedIn: !!user };
}
