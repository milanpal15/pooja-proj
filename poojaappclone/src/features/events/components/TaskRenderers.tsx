import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ProgressBar, Type, useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useTheme } from '@/theme';
import { ApiError, type EventDetail, type EventMilestone, type EventTask, isOffline, postProgress, type ProgressResponse } from '@/lib/api';

import { useCheckIn } from '../hooks/use-check-in';
import { useForeground } from '../hooks/use-foreground';
import { useLocationPermission } from '../hooks/use-location-permission';
import { counterOf, fill, isSupportedTask } from '../lib/events-logic';
import { needsJoin, taskAction, taskFailure } from '../lib/progress';
import { locationPlace, placeLabel, stopKey } from '../lib/route';
import { counterHref } from '../lib/routes';
import { LocationRationale } from './LocationRationale';

export type TaskRenderProps = {
  event: EventDetail;
  milestone: EventMilestone;
  task: EventTask;
  onProgress: (milestoneKey: string, res: ProgressResponse) => void;
  reload: () => void;
};

/** `self_mark`: one button; the server decides what that completes. */
function SelfMarkAction({ event, milestone, task, onProgress, reload }: TaskRenderProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onProgress(milestone.key, await postProgress(event.slug, milestone.key, task.key, {}));
    } catch (e) {
      const f = e instanceof ApiError ? taskFailure(e.status, e.code) : taskFailure(isOffline(e) ? 0 : 500);
      toast.error(t(f.key));
      if (f.reload) reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.note}>
      <Button label={t('ev_mark_done')} size="sm" loading={busy} disabled={busy} onPress={mark} />
    </View>
  );
}

/** `counter`: progress so far and the way into the full-screen counter. */
function CounterAction({ event, milestone, task }: TaskRenderProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const counter = counterOf(task);
  if (!counter) return null;
  return (
    <View style={styles.note}>
      <View style={styles.bar}>
        <ProgressBar value={counter.count} max={counter.target} />
      </View>
      <Type v="bodySm" tone="onSurfaceVariant" numeric>
        {fill(t('ev_count_of'), { count: counter.count, target: counter.target })}
      </Type>
      <Button
        label={counter.count > 0 ? t('ev_counter_continue') : t('ev_counter_start')}
        size="sm"
        onPress={() => router.push(counterHref(event.slug, milestone.key, task.key))}
      />
    </View>
  );
}

/**
 * `location`: the place (from the task's config) and a Check in button that runs the same flow as the
 * Route map's card — rationale sheet, one fresh fix, the server decides. No watcher here: it is a
 * manual check-in.
 */
function LocationAction({ event, milestone, task, onProgress, reload }: TaskRenderProps) {
  const { t, lang } = useLanguage();
  const foreground = useForeground();
  const perm = useLocationPermission(foreground);
  const { c } = useTheme();
  const checkIn = useCheckIn({ event, perm, onProgress, reload });
  const place = locationPlace(task);
  if (!place) return <GenericTask event={event} milestone={milestone} task={task} onProgress={onProgress} reload={reload} />;
  const key = stopKey({ milestoneKey: milestone.key, taskKey: task.key });
  const busy = checkIn.busyKey === key;
  const message = checkIn.message && checkIn.message.forKey === key ? checkIn.message : null;
  return (
    <View style={styles.note}>
      <Type v="bodyMd">{fill(t('ev_task_place'), { name: placeLabel(place, lang) })}</Type>
      {!!place.note && (
        <Type v="bodySm" tone="onSurfaceVariant">
          {place.note}
        </Type>
      )}
      {message && (
        <Type v="bodySm" color={c.error} accessibilityLiveRegion="polite">
          {fill(t(message.failure.key), message.failure.vars)}
        </Type>
      )}
      {perm.status === 'denied' ? (
        <>
          <Type v="bodySm" tone="onSurfaceVariant">
            {t('ev_loc_denied')}
          </Type>
          <Button label={t('ev_loc_open_settings')} variant="outline" size="sm" icon="settings" onPress={perm.openSettings} />
        </>
      ) : (
        <Button
          label={busy ? t('ev_checking_in') : t('ev_checkin')}
          size="sm"
          icon="mapPin"
          loading={busy}
          disabled={checkIn.busy}
          onPress={() => void checkIn.submit({ milestoneKey: milestone.key, taskKey: task.key })}
        />
      )}
      <LocationRationale perm={perm} />
    </View>
  );
}

/** The fallback: a kind this build knows by name but cannot do yet, or one it has never heard of. */
function GenericTask({ task }: TaskRenderProps) {
  const { t } = useLanguage();
  return (
    <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
      {isSupportedTask(task.kind) ? t('ev_task_soon') : t('ev_task_update')}
    </Type>
  );
}

/**
 * The registry of interactive task kinds (docs/EVENTS.md §0.3): adding a kind that needs a screen of its
 * own is one entry here. Anything not listed gets the generic fallback.
 */
export const TASK_RENDERERS: Partial<Record<string, (p: TaskRenderProps) => React.ReactElement | null>> = {
  self_mark: SelfMarkAction,
  counter: CounterAction,
  location: LocationAction,
};

/** What sits under a task row: an action by kind, "Join to take part", or the fallback. Nothing once done. */
export function TaskAction(p: TaskRenderProps) {
  const { t } = useLanguage();
  if (taskAction(p.task) === 'done') return null;
  const Renderer = TASK_RENDERERS[p.task.kind];
  if (Renderer && needsJoin(p.event)) {
    return (
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        {t('ev_task_join_first')}
      </Type>
    );
  }
  const R = Renderer ?? GenericTask;
  return <R {...p} />;
}

const styles = StyleSheet.create({
  bar: { alignSelf: 'stretch' },
  note: { marginLeft: 32, gap: 6, alignItems: 'flex-start' },
});
