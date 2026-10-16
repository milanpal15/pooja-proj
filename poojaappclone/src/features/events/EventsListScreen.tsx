import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, NoContent, Screen, Segmented, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useLanguage } from '@/i18n';
import { useAdmin } from '@/providers/admin';
import { useAuth } from '@/providers/auth';
import { Radius, Space, useTheme } from '@/theme';

import { CompletedStrip, SectionTitle } from './components/ListBits';
import { ContinueCard, FeaturedCard, UpcomingRow } from './components/EventCards';
import { type FilterItem, FilterChips } from './components/Chips';
import { useEventsList } from './hooks/use-events-list';
import { useMyEvents } from './hooks/use-my-events';
import { useTodayRows } from './hooks/use-today-rows';
import { useNow } from './hooks/use-now';
import { ALL, fill, filterCards, sectionList } from './lib/events-logic';
import { badgesHref, eventHref } from './lib/routes';

type Tab = 'explore' | 'mine';

/**
 * Events list (board "EventsList"): Explore / My events, type + tag chips built from the API, then
 * Continue (hidden when empty, each with its "Today" row), This week, Upcoming and a Completed strip
 * (hidden at 0). My events comes from `/api/me/events`.
 */
export function EventsListScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { flags } = useAdmin();
  const pad = useScrollPadding(Space.xl);
  const now = useNow();
  const { data, loading, failed, stale, reload } = useEventsList();

  const [tab, setTab] = useState<Tab>('explore');
  const [type, setType] = useState(ALL);
  const [tag, setTag] = useState(ALL);

  const types = useMemo(() => data?.types ?? [], [data]);
  const myEvents = useMyEvents();
  // `/api/me/events` is the source for My events; the list's `sections.mine` is the fallback until it answers.
  const mineAll = useMemo(() => (user ? (myEvents.data ?? data?.sections.mine ?? []) : []), [user, myEvents.data, data]);
  const sections = useMemo(
    () => (data ? sectionList(data.sections, { type, tag }) : null),
    [data, type, tag],
  );
  const mine = useMemo(() => filterCards(mineAll, { type, tag }), [mineAll, type, tag]);

  const typeChips: FilterItem[] = [
    { key: ALL, label: t('ev_all') },
    ...types.map((ty) => ({ key: ty.slug, label: (lang === 'hi' && ty.nameHi) || ty.name, dot: ty.color })),
  ];
  const tagChips: FilterItem[] = [{ key: ALL, label: t('ev_all') }, ...(data?.tags ?? []).map((g) => ({ key: g, label: g }))];
  const todayRows = useTodayRows(sections?.continue ?? []);
  const badges = data?.badgesCount ?? 0;
  const open = (slug: string) => router.push(eventHref(slug));
  const completed = data?.sections.completed;

  return (
    <Screen tabBar={false}>
      <AppBar
        title={t('events')}
        leftTitle
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ev_badges')}
            onPress={() => router.push(badgesHref())}
            style={[styles.badgePill, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
            <Icon name="star" size={16} color={c.goldInk} />
            <Type v="labelMd" tone="goldInk" numeric>
              {badges > 0 ? `${t('ev_badges')} · ${badges}` : t('ev_badges')}
            </Type>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={[styles.scroll, pad]} showsVerticalScrollIndicator={false}>
        {flags.events === false ? (
          <NoContent title={t('ev_empty_title')} body={t('ev_empty_body')} />
        ) : loading && !data ? (
          <ActivityIndicator color={c.primary} style={styles.center} />
        ) : failed && !data ? (
          <View style={styles.msg}>
            <NoContent title={t('ev_unreachable')} body="" />
            <Button label={t('ev_retry')} variant="secondary" onPress={reload} />
          </View>
        ) : (
          <>
            <View style={styles.pad}>
              <Segmented<Tab>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'explore', label: t('ev_explore') },
                  { value: 'mine', label: mineAll.length > 0 ? `${t('ev_my')} · ${mineAll.length}` : t('ev_my') },
                ]}
              />
            </View>

            {stale && (
              <Type v="bodySm" tone="onSurfaceVariant" center>
                {t('ev_saved_copy')}
              </Type>
            )}

            {types.length > 0 && <FilterChips items={typeChips} selected={type} onSelect={setType} />}
            {(data?.tags.length ?? 0) > 0 && <FilterChips small items={tagChips} selected={tag} onSelect={setTag} />}

            {tab === 'explore' ? (
              sections && sections.total === 0 ? (
                <View style={styles.msg}>
                  {type === ALL && tag === ALL ? (
                    <NoContent title={t('ev_empty_title')} body={t('ev_empty_body')} />
                  ) : (
                    <Type v="bodyMd" tone="onSurfaceVariant" center>
                      {t('ev_no_match')}
                    </Type>
                  )}
                </View>
              ) : (
                sections && (
                  <>
                    {sections.continue.length > 0 && (
                      <View style={styles.block}>
                        <SectionTitle title={t('ev_continue')} />
                        <View style={[styles.pad, styles.rows]}>
                          {sections.continue.map((e) => (
                            <ContinueCard key={e.slug} card={e} types={types} now={now} today={todayRows[e.slug]} onPress={() => open(e.slug)} />
                          ))}
                        </View>
                      </View>
                    )}
                    {sections.thisWeek.length > 0 && (
                      <View style={styles.block}>
                        <SectionTitle title={t('ev_this_week')} />
                        <View style={[styles.pad, styles.rows]}>
                          {sections.thisWeek.map((e) => (
                            <FeaturedCard key={e.slug} card={e} types={types} now={now} onPress={() => open(e.slug)} />
                          ))}
                        </View>
                      </View>
                    )}
                    {sections.upcoming.length > 0 && (
                      <View style={styles.block}>
                        <SectionTitle title={t('ev_upcoming')} />
                        <View style={[styles.pad, styles.rows]}>
                          {sections.upcoming.map((e) => (
                            <UpcomingRow key={e.slug} card={e} types={types} now={now} onPress={() => open(e.slug)} />
                          ))}
                        </View>
                      </View>
                    )}
                  </>
                )
              )
            ) : !user ? (
              <View style={styles.msg}>
                <NoContent title={t('ev_my_signin_title')} body={t('ev_my_signin_body')} />
              </View>
            ) : mine.length === 0 ? (
              <View style={styles.msg}>
                <NoContent title={t('ev_my_empty_title')} body={t('ev_my_empty_body')} />
              </View>
            ) : (
              <View style={[styles.pad, styles.rows]}>
                {mine.map((e) => (
                  <ContinueCard key={e.slug} card={e} types={types} now={now} onPress={() => open(e.slug)} />
                ))}
              </View>
            )}

            {tab === 'explore' && !!completed && completed.count > 0 && (
              <View style={styles.pad}>
                <CompletedStrip label={fill(t('ev_completed'), { n: completed.count })} titles={completed.titles} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 16, paddingTop: Space.xs },
  center: { marginTop: Space.xxl },
  pad: { paddingHorizontal: Space.margin },
  block: { gap: 10 },
  rows: { gap: 12 },
  msg: { padding: Space.margin, gap: Space.md, alignItems: 'center' },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1 },
});
