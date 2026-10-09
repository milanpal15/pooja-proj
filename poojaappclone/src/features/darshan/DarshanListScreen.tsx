import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, IconButton, NoContent, Screen, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import type { LiveCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useSavedTemples } from '@/lib/saved-temples';
import { Radius, Space, useTheme } from '@/theme';

import { CategoryChips } from './components/CategoryChips';
import { FeaturedCard } from './components/FeaturedCard';
import { SavedStrip } from './components/SavedStrip';
import { ScheduleRow } from './components/ScheduleRow';
import { SectionHead } from './components/SectionHead';
import { StreamRow } from './components/StreamRow';
import { useAartiReminders } from './hooks/use-aarti-reminders';
import { useLiveList } from './hooks/use-live-list';
import { filterStreams, liveOnes, playerHref } from './lib/live-logic';

/**
 * Live Darshan list (board "LiveList"): featured live card, Live now rows, saved temples with a red
 * ring when live, and today's aarti schedule with reminders. Everything comes from `/api/live`;
 * when that is unreachable the screen says so instead of inventing a stream.
 */
export function DarshanListScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const pad = useScrollPadding(Space.xl);
  const { data, loading, failed, reload } = useLiveList();
  const { savedIds } = useSavedTemples();
  const reminders = useAartiReminders();

  const [filter, setFilter] = useState('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const streams = useMemo(() => data?.streams ?? [], [data]);
  const liveCount = liveOnes(streams).length;
  const shown = useMemo(() => filterStreams(streams, filter, query), [streams, filter, query]);
  const live = liveOnes(shown);
  const featured = live[0];
  const rest = live.slice(1);
  const notLive = shown.filter((s) => s.state !== 'live');
  const saved = useMemo(() => streams.filter((s) => savedIds.includes(s.templeSlug)), [streams, savedIds]);
  const open = (card: LiveCard) => router.push(playerHref(card.slug));

  const chips = [
    { key: 'all', label: t('ld_all') },
    { key: 'live', label: liveCount ? `${t('ld_live_now')} · ${liveCount}` : t('ld_live_now') },
    ...(data?.categories ?? []).map((cat) => ({ key: cat.slug, label: pick(lang, cat.name, cat.nameHi) })),
  ];
  const nameOf = (slug: string) => {
    const s = streams.find((x) => x.slug === slug);
    return s ? pick(lang, s.templeName, s.templeNameHi) : '';
  };

  return (
    <Screen tabBar={false}>
      <AppBar
        title={t('live_darshan')}
        leftTitle
        right={
          <IconButton
            name="search"
            label={t('ld_search')}
            size={44}
            variant="solid"
            onPress={() => {
              setSearching((s) => !s);
              setQuery('');
            }}
          />
        }
      />
      {searching && (
        <View style={styles.searchWrap}>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('ld_search_ph')}
            placeholderTextColor={c.onSurfaceFaint}
            returnKeyType="search"
            style={[styles.search, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant, color: c.onSurface }]}
          />
        </View>
      )}

      <ScrollView contentContainerStyle={[styles.scroll, pad]} showsVerticalScrollIndicator={false}>
        {loading && !data ? (
          <ActivityIndicator color={c.primary} style={styles.center} />
        ) : failed && !data ? (
          <View style={styles.msg}>
            <NoContent title={t('ld_unreachable')} body="" />
            <Button label={t('ld_retry')} variant="secondary" onPress={reload} />
          </View>
        ) : (
          <>
            <CategoryChips items={chips} selected={filter} onSelect={setFilter} />

            {streams.length === 0 ? (
              <View style={styles.msg}>
                <NoContent title={t('ld_empty_title')} body={t('ld_empty_body')} />
              </View>
            ) : shown.length === 0 ? (
              <Type v="bodyMd" tone="onSurfaceVariant" center style={styles.msg}>
                {t('ld_no_match')}
              </Type>
            ) : (
              <>
                {featured && (
                  <View style={styles.pad}>
                    <FeaturedCard card={featured} onPress={() => open(featured)} />
                  </View>
                )}

                {rest.length > 0 && (
                  <View style={styles.block}>
                    <SectionHead title={t('ld_live_now')} />
                    <View style={[styles.pad, styles.rows]}>
                      {rest.map((s) => (
                        <StreamRow key={s.slug} card={s} onPress={() => open(s)} />
                      ))}
                    </View>
                  </View>
                )}

                {notLive.length > 0 && (
                  <View style={styles.block}>
                    {live.length > 0 && <SectionHead title={t('ld_offline')} />}
                    <View style={[styles.pad, styles.rows]}>
                      {notLive.map((s) => (
                        <StreamRow key={s.slug} card={s} onPress={() => open(s)} />
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            {saved.length > 0 && (
              <View style={styles.block}>
                <SectionHead title={t('ld_saved')} action={t('ld_manage')} onAction={() => router.push('/saved-temples')} />
                <SavedStrip cards={saved} onOpen={open} />
                <Type v="bodySm" tone="onSurfaceVariant" style={styles.pad}>
                  {t('ld_ring_hint')}
                </Type>
              </View>
            )}

            {(data?.schedule.length ?? 0) > 0 && (
              <View style={styles.block}>
                <SectionHead title={t('ld_schedule')} />
                <View style={styles.pad}>
                  <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
                    {data!.schedule.map((item, i, all) => {
                      const temple = nameOf(item.streamSlug) || item.templeName;
                      const title = pick(lang, item.name, item.nameHi);
                      return (
                        <ScheduleRow
                          key={`${item.streamSlug}|${item.time}|${item.name}`}
                          time={item.time}
                          title={title}
                          subtitle={temple}
                          on={reminders.isOn(item.streamSlug, item.time, item.name)}
                          last={i === all.length - 1}
                          onToggle={() =>
                            reminders.toggle({
                              streamSlug: item.streamSlug,
                              time: item.time,
                              name: item.name,
                              title,
                              templeName: temple,
                              body: t('ld_notif_body'),
                            })
                          }
                        />
                      );
                    })}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 22, paddingTop: Space.xs },
  center: { marginTop: Space.xxl },
  pad: { paddingHorizontal: Space.margin },
  block: { gap: 10 },
  rows: { gap: 10 },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center' },
  searchWrap: { paddingHorizontal: Space.margin, paddingBottom: Space.sm },
  search: { height: 46, borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 18, fontSize: 15 },
  card: { borderRadius: Radius.lg + 2, borderWidth: 1, paddingHorizontal: 14 },
});
