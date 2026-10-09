import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, Space, useTheme } from '@/theme';

import { time12 } from '../lib/live-logic';
import { LiveBadge, Thumb, ViewersPill } from './LiveBits';

/** The big card for the first live stream. */
export function FeaturedCard({ card, onPress }: { card: LiveCard; onPress: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const name = pick(lang, card.templeName, card.templeNameHi);
  const aarti = card.currentAarti ? pick(lang, card.currentAarti.name, card.currentAarti.nameHi) : '';
  const since = card.startedAt ? time12(hhmm(card.startedAt)) : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t('live')}`}
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Thumb slug={card.slug} cover={card.cover} radius={Radius.lg} dim style={styles.hero}>
        <View style={styles.pad}>
          <View style={styles.badges}>
            <LiveBadge />
            <ViewersPill viewers={card.viewers} />
          </View>
          <View style={styles.play}>
            <View style={[styles.playDisc, { backgroundColor: 'rgba(255,255,255,0.92)' }]}>
              <Icon name="play" size={24} color={c.primary} filled />
            </View>
          </View>
          {!!aarti && (
            <Type v="titleLg" color="#FFFFFF" style={styles.title}>
              {aarti}
            </Type>
          )}
        </View>
      </Thumb>
      <View style={styles.foot}>
        <View style={styles.footText}>
          <Type v="titleMd" numberOfLines={1}>
            {name}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {[card.place, since ? `${t('ld_started')} ${since}` : ''].filter(Boolean).join(' · ')}
          </Type>
        </View>
        <View style={[styles.cta, { backgroundColor: c.accent }]}>
          <Type v="labelLg" color={c.onAccent}>
            {t('ld_watch')}
          </Type>
        </View>
      </View>
    </Pressable>
  );
}

/** Local "HH:MM" of an ISO instant. */
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderWidth: 1, padding: 6 },
  hero: { height: 200 },
  pad: { flex: 1, padding: 12 },
  badges: { flexDirection: 'row', gap: 6 },
  play: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playDisc: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  title: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Space.sm, paddingTop: 10 },
  footText: { flex: 1 },
  cta: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
});
