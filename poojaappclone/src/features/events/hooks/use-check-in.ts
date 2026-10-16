import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, type EventDetail, isOffline, type LocationReport, postProgress, type ProgressResponse } from '@/lib/api';
import { useLanguage } from '@/i18n';

import { type LocationFailure, locationFailure, reportFromPosition, stopKey } from '../lib/route';
import type { LocationPermissionController } from './use-location-permission';

/** Where to report: a `location` task. */
export type CheckInTarget = { milestoneKey: string; taskKey: string };

/** What the card says under the button: a message key + its placeholders. */
export type CheckInMessage = { forKey: string; failure: Pick<LocationFailure, 'key' | 'vars'> | { key: 'ev_loc_unavailable'; vars: Record<string, string> } };

const FIX_TIMEOUT_MS = 15_000;

/** A fresh position, or null (no GPS, services off, timed out). */
async function freshPosition(): Promise<Location.LocationObject | null> {
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

/**
 * One check-in at a time for a Yatra screen or a task row: ask permission (rationale first), take a
 * fresh fix, report `{lat,lng,accuracyM,mocked,at}` through `postProgress`, hand the answer to
 * `onProgress` (which shows the completion sheet), or turn a refusal into a message. The server
 * decides; a `too_far` etc. is not retried here. `reported` / `triedAt` are refs read by the auto
 * check-in decision (inside the watcher callback, never during render) so one stop is reported once.
 */
export function useCheckIn(opts: {
  event: Pick<EventDetail, 'slug'>;
  perm: Pick<LocationPermissionController, 'ensure'>;
  onProgress: (milestoneKey: string, res: ProgressResponse) => void;
  reload: () => void;
}) {
  const { event, onProgress, reload } = opts;
  const { ensure } = opts.perm;
  const { lang } = useLanguage();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<CheckInMessage | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const reported = useRef<Set<string>>(new Set());
  const triedAt = useRef<Record<string, number>>({});

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `report` given = the watcher's own fix (automatic); absent = take a fresh one (the button). */
  const submit = useCallback(
    async (target: CheckInTarget, report?: LocationReport) => {
      if (busy.current) return;
      const key = stopKey(target);
      busy.current = true;
      triedAt.current[key] = Date.now();
      setBusyKey(key);
      setMessage(null);
      try {
        let body = report;
        if (!body) {
          if (!(await ensure())) return;
          const pos = await freshPosition();
          if (!pos) {
            if (alive.current) setMessage({ forKey: key, failure: { key: 'ev_loc_unavailable', vars: {} } });
            return;
          }
          body = reportFromPosition(pos);
        }
        const res = await postProgress(event.slug, target.milestoneKey, target.taskKey, body as unknown as Record<string, unknown>);
        reported.current.add(key);
        onProgress(target.milestoneKey, res);
      } catch (e) {
        const f =
          e instanceof ApiError
            ? locationFailure(e.status, e.code, e.body, lang)
            : locationFailure(isOffline(e) ? 0 : 500, undefined, undefined, lang);
        if (f.final) reported.current.add(key);
        if (alive.current) setMessage({ forKey: key, failure: f });
        if (f.reload) reload();
      } finally {
        busy.current = false;
        if (alive.current) setBusyKey(null);
      }
    },
    [event.slug, ensure, onProgress, reload, lang],
  );

  const clearMessage = useCallback(() => setMessage(null), []);

  return { submit, busyKey, busy: busyKey !== null, message, clearMessage, reported, triedAt } as const;
}
