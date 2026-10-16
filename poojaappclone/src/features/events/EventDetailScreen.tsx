import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button, CircleButton, NoContent, Screen, Type, useScrollPadding } from '@/components/ui';
import type { EventMe } from '@/lib/api';
import { useLanguage } from '@/i18n';
import { pick } from '@/lib/localized';
import { Space, useTheme } from '@/theme';

import { CoverTag, toneOfStatus } from './components/Chips';
import { CompletionSheet } from './components/CompletionSheet';
import { ContentBlock, RewardsBlock } from './components/ContentBlocks';
import { CoverArt } from './components/CoverArt';
import { RegistrationBlock, ScheduleBlock, VenueBlock } from './components/InfoBlocks';
import { MilestonesBlock } from './components/MilestonesBlock';
import { useCompletion } from './hooks/use-completion';
import { useEventDetail } from './hooks/use-event-detail';
import { useNow } from './hooks/use-now';
import { fill, statusLabel, themeOf, visibleBlocks } from './lib/events-logic';
import { applyMe } from './lib/progress';
import { eventsHref } from './lib/routes';

/**
 * Event detail (boards "EventYatra" / "EventGarba"): a BLOCK COMPOSER. It draws the hero, then exactly
 * the blocks present in `event.blocks`, in that order. It never asks what TYPE of event this is —
 * colours come from the event's theme, structure from its blocks, and an unknown block is skipped.
 */
export function EventDetailScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const pad = useScrollPadding(Space.xl);
  const now = useNow();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const id = String(slug ?? '');
  const { data: event, loading, failed, missing, stale, reload, mutate } = useEventDetail(id);
  const { state: completion, onProgress, dismiss } = useCompletion(id, event, mutate, reload);
  const setMe = (me: EventMe | null) => mutate((d) => applyMe(d, me));
  const back = () => (router.canGoBack() ? router.back() : router.replace(eventsHref()));

  if (loading && !event) {
    return (
      <Screen tabBar={false}>
        <ActivityIndicator color={c.primary} style={styles.center} />
      </Screen>
    );
  }
  if (!event) {
    return (
      <Screen tabBar={false}>
        <View style={styles.msg}>
          <NoContent title={missing ? t('ev_not_found_title') : t('ev_unreachable')} body={missing ? t('ev_not_found_body') : ''} />
          {failed && <Button label={t('ev_retry')} variant="secondary" onPress={reload} />}
          <Button label={t('events')} variant="secondary" onPress={back} />
        </View>
      </Screen>
    );
  }

  const theme = themeOf(event);
  const st = statusLabel(event, now);
  const stText = fill(t(st.key), st.vars);

  const blocks: Record<string, React.ReactNode> = {
    schedule: <ScheduleBlock event={event} />,
    registration: <RegistrationBlock event={event} now={now} setMe={setMe} reload={reload} />,
    venue: <VenueBlock event={event} />,
    milestones: <MilestonesBlock event={event} onProgress={onProgress} reload={reload} />,
    rewards: <RewardsBlock event={event} />,
    content: <ContentBlock event={event} />,
  };

  return (
    <Screen tabBar={false}>
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
        <CoverArt gradient={theme.gradient} cover={event.cover} dim style={styles.hero}>
          <View style={styles.heroIn}>
            <CircleButton name="back" label={t('events')} onPress={back} />
            <View style={styles.heroText}>
              <View style={styles.tags}>
                {!!event.typeName && <CoverTag label={(lang === 'hi' && event.typeNameHi ? event.typeNameHi : event.typeName).toUpperCase()} />}
                <CoverTag label={stText} tone={toneOfStatus(st.tone)} />
              </View>
              <Type v="headlineMd" color="#FFFFFF">
                {pick(lang, event.title, event.titleHi)}
              </Type>
              {!!event.summary && (
                <Type v="bodySm" color="rgba(255,255,255,0.92)">
                  {pick(lang, event.summary, event.summaryHi)}
                </Type>
              )}
            </View>
          </View>
        </CoverArt>

        {stale && (
          <Type v="bodySm" tone="onSurfaceVariant" center style={styles.stale}>
            {t('ev_saved_copy')}
          </Type>
        )}

        <View style={styles.blocks}>
          {visibleBlocks(event.blocks).map((name) => (
            <View key={name}>{blocks[name]}</View>
          ))}
        </View>
      </ScrollView>
      <CompletionSheet state={completion} slug={id} eventTitle={pick(lang, event.title, event.titleHi)} onClose={dismiss} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: Space.xxl },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center', marginTop: Space.xxl },
  hero: { height: 250 },
  heroIn: { flex: 1, padding: Space.margin, paddingTop: Space.xl, justifyContent: 'space-between' },
  heroText: { gap: 6 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  stale: { paddingTop: Space.sm },
  blocks: { padding: Space.margin, gap: 16 },
});
