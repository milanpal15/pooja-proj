import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, ProgressBar, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { EventCard, EventType } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, Space, useTheme } from '@/theme';

import { clockTime, fill, longDate, progressRatio, shortDate, statusLabel, themeOf } from '../lib/events-logic';
import { CoverArt } from './CoverArt';
import { CoverTag, toneOfStatus } from './Chips';

type Common = { card: EventCard; types: EventType[]; now: number; onPress: () => void };
/** The "Today: …" row of a Continue card (server's current milestone). */
export type TodayRow = { index: number; title: string } | null;

function useParts(card: EventCard, types: EventType[], now: number) {
  const { t, lang } = useLanguage();
  const ty = types.find((x) => x.slug === card.typeSlug);
  const theme = themeOf(card, ty?.color);
  const type = (lang === 'hi' ? card.typeNameHi || ty?.nameHi : '') || card.typeName || ty?.name || '';
  const st = statusLabel(card, now);
  const n = card.milestoneCount;
  const milestones = n > 0 ? (n === 1 ? t('ev_one_milestone') : fill(t('ev_n_milestones'), { n })) : '';
  return {
    t,
    theme,
    type,
    title: pick(lang, card.title, card.titleHi),
    summary: pick(lang, card.summary, card.summaryHi),
    st: { ...st, label: fill(t(st.key), st.vars) },
    milestones,
    // Honest numbers: shown only when the server sent them.
    registered: card.registered !== null && card.registered !== undefined ? fill(t('ev_registered'), { n: card.registered }) : '',
    spots: card.spotsLeft !== null && card.spotsLeft !== undefined ? fill(t('ev_spots'), { n: card.spotsLeft }) : '',
  };
}

/** "Continue where you left off": a joined event with its progress. */
export function ContinueCard({ card, types, now, onPress, today }: Common & { today?: TodayRow }) {
  const { c } = useTheme();
  const p = useParts(card, types, now);
  const prog = card.progress;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={p.title} onPress={onPress} style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <CoverArt gradient={p.theme.gradient} cover={card.cover} topRadius={Radius.lg + 2} dim style={styles.coverShort}>
        <View style={styles.coverIn}>
          <CoverTag label={p.type.toUpperCase()} />
          <Type v="titleLg" color="#FFFFFF" numberOfLines={2}>
            {p.title}
          </Type>
        </View>
      </CoverArt>
      <View style={styles.body}>
        {prog && (
          <>
            <View style={styles.between}>
              <Type v="labelMd" numeric>
                {fill(p.t('ev_m_of'), { done: prog.done, total: prog.total })}
              </Type>
              {!!card.endsAt && (
                <Type v="bodySm" tone="onSurfaceVariant">
                  {fill(p.t('ev_ends'), { date: shortDate(card.endsAt) })}
                </Type>
              )}
            </View>
            <ProgressBar value={progressRatio(prog)} max={1} />
          </>
        )}
        {!!today && (
          <View style={[styles.today, { backgroundColor: c.accentContainer }]}>
            <View style={[styles.todayNo, { backgroundColor: c.accent }]}>
              <Type v="titleSm" color="#FFFFFF" numeric>
                {today.index}
              </Type>
            </View>
            <Type v="titleSm" numberOfLines={2} style={styles.todayText}>
              {fill(p.t('ev_today'), { title: today.title })}
            </Type>
            <View style={[styles.go, { backgroundColor: c.primary }]}>
              <Type v="labelLg" tone="onPrimary">
                {p.t('ev_go')}
              </Type>
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** "This week": a large themed card — when, where (if known), counts (if real). */
export function FeaturedCard({ card, types, now, onPress }: Common) {
  const { c } = useTheme();
  const p = useParts(card, types, now);
  const when = card.startsAt ? `${longDate(card.startsAt)} · ${clockTime(card.startsAt)}` : '';
  const facts = [p.milestones, p.registered, p.spots].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={p.title} onPress={onPress} style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <CoverArt gradient={p.theme.gradient} cover={card.cover} topRadius={Radius.lg + 2} dim style={styles.coverTall}>
        <View style={styles.coverIn}>
          <View style={styles.between}>
            <CoverTag label={p.type.toUpperCase()} />
            <CoverTag label={p.st.label} tone={toneOfStatus(p.st.tone)} />
          </View>
          <View>
            <Type v="titleLg" color="#FFFFFF" numberOfLines={2}>
              {p.title}
            </Type>
            {!!when && (
              <Type v="bodySm" color="rgba(255,255,255,0.9)">
                {when}
              </Type>
            )}
          </View>
        </View>
      </CoverArt>
      <View style={[styles.body, styles.row]}>
        <View style={styles.rowText}>
          {!!card.venueLabel && (
            <View style={styles.iconLine}>
              <Icon name="mapPin" size={15} color={c.primary} />
              <Type v="bodySm" numberOfLines={1} style={styles.flex}>
                {card.venueLabel}
              </Type>
            </View>
          )}
          {!!facts && (
            <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={2}>
              {facts}
            </Type>
          )}
        </View>
        <Icon name="chevronRight" size={20} color={c.onSurfaceVariant} />
      </View>
    </Pressable>
  );
}

/** "Upcoming": a compact row. */
export function UpcomingRow({ card, types, now, onPress }: Common) {
  const { c } = useTheme();
  const p = useParts(card, types, now);
  const line = [card.startsAt ? fill(p.t('ev_starts'), { date: shortDate(card.startsAt) }) : '', p.milestones, card.rewardLabel].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={p.title} onPress={onPress} style={[styles.rowCard, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <CoverArt gradient={p.theme.gradient} cover={card.cover} radius={14} style={styles.thumb} />
      <View style={styles.rowText}>
        {!!p.type && (
          <View style={[styles.typePill, { backgroundColor: p.theme.color + '22' }]}>
            <Type v="labelSm" color={p.theme.color} style={styles.pillText}>
              {p.type.toUpperCase()}
            </Type>
          </View>
        )}
        <Type v="titleSm" numberOfLines={2}>
          {p.title}
        </Type>
        {!!p.summary && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={2}>
            {p.summary}
          </Type>
        )}
        {!!line && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={2}>
            {line}
          </Type>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  today: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, padding: 10 },
  todayNo: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  todayText: { flex: 1, minWidth: 0 },
  go: { height: 36, minWidth: 56, paddingHorizontal: 16, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Radius.lg + 2, borderWidth: 1 },
  coverShort: { height: 120 },
  coverTall: { height: 170 },
  coverIn: { flex: 1, padding: 14, justifyContent: 'space-between' },
  body: { padding: 14, gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1 },
  rowCard: { flexDirection: 'row', gap: 12, borderRadius: Radius.lg + 2, borderWidth: 1, padding: 12, alignItems: 'flex-start' },
  thumb: { width: 84, height: 84 },
  typePill: { alignSelf: 'flex-start', borderRadius: Radius.sm * 2, paddingHorizontal: 8, height: 20, justifyContent: 'center' },
  pillText: { letterSpacing: 0.4 },
});
