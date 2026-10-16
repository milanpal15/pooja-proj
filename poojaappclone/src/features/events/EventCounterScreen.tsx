import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, NoContent, ProgressRing, Screen, Type, useToast } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { pick } from '@/lib/localized';
import { Space, useTheme } from '@/theme';

import { CompletionSheet } from './components/CompletionSheet';
import { useCompletion } from './hooks/use-completion';
import { useCounter } from './hooks/use-counter';
import { useEventDetail } from './hooks/use-event-detail';
import { counterOf, fill } from './lib/events-logic';
import { findTask, taskFailure } from './lib/progress';
import { eventHref } from './lib/routes';

/**
 * The full-screen counter for a `counter` task (route `/events/[slug]/counter?m=&t=`): a big ring, tap
 * anywhere on the pad to count. Taps are batched and flushed by `useCounter`; the count always resumes
 * from the server's `state.count`, and reaching the target shows the completion sheet the server returns.
 */
export function EventCounterScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const params = useLocalSearchParams<{ slug: string; m: string; t: string }>();
  const slug = String(params.slug ?? '');
  const mKey = String(params.m ?? '');
  const tKey = String(params.t ?? '');

  const { data: event, loading, reload, mutate } = useEventDetail(slug);
  const { state: completion, onProgress, dismiss } = useCompletion(slug, event, mutate, reload);

  const found = useMemo(() => findTask(event, mKey, tKey), [event, mKey, tKey]);
  const counter = found ? counterOf(found.task) : null;
  const server = useMemo(
    () => (found && counter ? { count: counter.count, target: counter.target, done: !!(found.task.done || found.task.completedAt) } : null),
    // Only the first load seeds the counter (see useCounter); later changes come through responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [found?.task.key, counter?.target],
  );

  const c2 = useCounter({
    slug,
    mKey,
    tKey,
    server,
    onResponse: (res) => onProgress(mKey, res),
    onRejected: (status, code) => {
      const f = taskFailure(status, code);
      toast.error(t(f.key));
      if (f.reload) reload();
    },
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace(eventHref(slug)));

  if (loading && !event) {
    return (
      <Screen tabBar={false}>
        <AppBar title={t('ev_counter_title')} leftTitle />
        <ActivityIndicator color={c.primary} style={styles.center} />
      </Screen>
    );
  }
  if (!event || !found || !counter) {
    return (
      <Screen tabBar={false}>
        <AppBar title={t('ev_counter_title')} leftTitle />
        <View style={styles.msg}>
          <NoContent title={t('ev_counter_missing')} body="" />
          <Button label={t('ev_back_to_event')} variant="secondary" onPress={back} />
        </View>
      </Screen>
    );
  }

  const target = c2.target || counter.target;
  const done = c2.done || !!(found.task.done || found.task.completedAt);
  const count = done ? target : c2.count;
  const label = pick(lang, found.task.title, found.task.titleHi);
  const cfgLabel = typeof found.task.config?.label === 'string' ? found.task.config.label : '';
  const statusText =
    c2.status === 'offline' ? t('ev_counter_offline') : c2.status === 'saving' ? t('ev_counter_saving') : c2.state && c2.state.pending + c2.state.inflight > 0 ? t('ev_counter_saving') : t('ev_counter_saved');

  return (
    <Screen tabBar={false}>
      <AppBar title={pick(lang, found.milestone.title, found.milestone.titleHi)} leftTitle />
      <View style={styles.body}>
        <Type v="titleLg" center>
          {cfgLabel || label}
        </Type>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('ev_counter_tap')}. ${fill(t('ev_count_of'), { count, target })}`}
          disabled={done}
          onPress={c2.press}
          style={({ pressed }) => [styles.pad, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}>
          <ProgressRing progress={target > 0 ? count / target : 0} size={280} thickness={14} ember={!done}>
            {done ? (
              <Icon name="check" size={72} color={c.success} />
            ) : (
              <>
                <Type v="display" numeric accessibilityLiveRegion="polite" style={styles.big}>
                  {count}
                </Type>
                <Type v="bodyMd" tone="onSurfaceVariant" numeric>
                  {fill(t('ev_counter_of'), { target })}
                </Type>
              </>
            )}
          </ProgressRing>
        </Pressable>

        {done ? (
          <Type v="titleMd" tone="success" center>
            {t('ev_counter_done')}
          </Type>
        ) : (
          <Type v="bodyMd" tone="onSurfaceVariant" center>
            {t('ev_counter_tap')}
          </Type>
        )}
        <Type v="bodySm" tone={c2.status === 'offline' ? 'error' : 'onSurfaceFaint'} center>
          {statusText}
        </Type>
        {done && <Button label={t('ev_back_to_event')} onPress={back} />}
      </View>
      <CompletionSheet
        state={completion}
        slug={slug}
        eventTitle={pick(lang, event.title, event.titleHi)}
        onClose={dismiss}
        onBack={back}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: Space.xxl },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center', marginTop: Space.xxl },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: Space.margin },
  pad: { borderRadius: 160 },
  big: { fontSize: 64, lineHeight: 72 },
});
