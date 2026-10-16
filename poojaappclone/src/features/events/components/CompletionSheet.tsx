import { LinearGradient } from 'expo-linear-gradient';
import { Share, StyleSheet, View } from 'react-native';

import { Button, CoinDisc, Icon, ProgressBar, Sheet, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import type { CompletionState } from '../hooks/use-completion';
import { clockTime, fill, longDate } from '../lib/events-logic';
import { howLines, pips, shareText } from '../lib/progress';

/**
 * The themed "milestone complete" sheet (board "MilestoneDone"), shown when a progress response carries
 * `completion`. Everything on it is the server's: coins added, the pips, the "how it was completed"
 * lines, the next milestone. "We'll remind you" appears ONLY when the reminder was actually scheduled.
 * The event-completed variant swaps the heading and lists the badges earned.
 */
export function CompletionSheet({
  state,
  slug,
  eventTitle,
  onClose,
  onBack,
}: {
  state: CompletionState;
  slug: string;
  eventTitle: string;
  onClose: () => void;
  /** After closing: where "Back to event" goes. Defaults to just closing (the detail screen). */
  onBack?: () => void;
}) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const completion = state?.completion;
  const reminded = !!state?.reminded;

  const title = completion ? pick(lang, completion.title, completion.titleHi) : '';
  const lines = completion ? howLines(completion, lang) : [];
  const dots = completion ? pips(completion.progress) : null;
  const finished = !!completion?.eventCompleted;
  const badges = completion?.badges ?? [];
  const next = completion?.next;

  const nextLine = next
    ? next.opensAt
      ? fill(t('ev_next_opens'), { title: pick(lang, next.title, next.titleHi), when: `${longDate(next.opensAt)}, ${clockTime(next.opensAt)}` })
      : fill(t('ev_next_title'), { title: pick(lang, next.title, next.titleHi) })
    : '';

  const share = () => {
    Share.share({ message: shareText(t('ev_share_text'), { title, event: eventTitle, slug }) }).catch(() => {});
  };
  const back = () => {
    onClose();
    onBack?.();
  };

  return (
    <Sheet visible={!!completion} onClose={onClose}>
      {!!completion && (
        <>
          <View style={styles.head}>
            <View style={[styles.halo, { backgroundColor: c.accentContainer }]}>
              <LinearGradient colors={[c.gold, c.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.disc}>
                <Icon name="check" size={40} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Type v="labelMd" tone="success" accessibilityRole="header" style={styles.caps}>
              {finished ? t('ev_done_event_label') : t('ev_done_ms_label')}
            </Type>
            <Type v="headlineMd" center>
              {title || eventTitle}
            </Type>
            <Type v="bodyMd" tone="onSurfaceVariant" center>
              {finished ? t('ev_done_event_sub') : t('ev_done_ms_sub')}
            </Type>
            {completion.coins > 0 && (
              <View style={[styles.pill, { backgroundColor: c.accentContainer, borderColor: c.goldHairline }]}>
                <CoinDisc size={18} />
                <Type v="titleSm" tone="goldInk" numeric>
                  {fill(t('ev_coins_added'), { n: completion.coins })}
                </Type>
              </View>
            )}
          </View>

          {finished && badges.length > 0 && (
            <View style={styles.badges}>
              {badges.map((b) => (
                <View key={b.slug} style={[styles.badge, { backgroundColor: c.containerLowest, borderColor: c.goldHairline }]}>
                  <Icon name="star" size={16} color={c.goldInk} />
                  <Type v="labelMd" tone="goldInk">
                    {pick(lang, b.name, b.nameHi)}
                  </Type>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.card, { backgroundColor: c.container }]}>
            <View style={styles.between}>
              <Type v="titleSm" numberOfLines={1} style={styles.flex}>
                {eventTitle}
              </Type>
              <Type v="titleSm" tone="primary" numeric>
                {fill(t('ev_n_of_m'), { done: completion.progress.done, total: completion.progress.total })}
              </Type>
            </View>
            {dots ? (
              <View style={styles.pips}>
                {dots.map((on, i) => (
                  <View key={i} style={[styles.pip, { backgroundColor: on ? c.success : c.outlineVariant }]} />
                ))}
              </View>
            ) : (
              <ProgressBar value={completion.progress.done} max={Math.max(1, completion.progress.total)} tone="success" />
            )}
            {!!nextLine && (
              <Type v="bodySm" tone="onSurfaceVariant">
                {nextLine}
                {reminded ? ` ${t('ev_well_remind')}` : ''}
              </Type>
            )}
          </View>

          {lines.length > 0 && (
            <View style={styles.how}>
              <Type v="labelMd" tone="goldInk" style={styles.caps}>
                {t('ev_how_done')}
              </Type>
              {lines.map((l, i) => (
                <View key={i} style={styles.howRow}>
                  <View style={[styles.tick, { backgroundColor: c.successContainer }]}>
                    <Icon name="check" size={13} color={c.success} />
                  </View>
                  <Type v="bodyMd" style={styles.flex}>
                    {l}
                  </Type>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            <Button label={t('ev_share')} variant="outline" icon="share" onPress={share} style={styles.flex} />
            <Button label={t('ev_back_to_event')} onPress={back} style={styles.flex2} />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 6 },
  halo: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  disc: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1 },
  card: { borderRadius: Radius.lg, padding: 14, gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  flex2: { flex: 1.4 },
  pips: { flexDirection: 'row', gap: 5 },
  pip: { flex: 1, height: 5, borderRadius: 3 },
  how: { gap: 10 },
  howRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  actions: { flexDirection: 'row', gap: 10 },
});
