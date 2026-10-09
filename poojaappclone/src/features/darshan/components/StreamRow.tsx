import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Radius, useTheme } from '@/theme';

import { compactCount, time12 } from '../lib/live-logic';
import { LiveBadge, Thumb } from './LiveBits';

/** One stream in a list: thumbnail with LIVE badge, name, place · aarti, viewers (only if known). */
export function StreamRow({ card, onPress }: { card: LiveCard; onPress: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const name = pick(lang, card.templeName, card.templeNameHi);
  const aarti = card.currentAarti ? pick(lang, card.currentAarti.name, card.currentAarti.nameHi) : '';
  const next = card.nextAarti ? `${t('ld_next_at')} ${time12(card.nextAarti.time)}` : '';
  const viewers = compactCount(card.viewers);
  const sub = [card.place, card.state === 'live' ? aarti : next].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={[styles.row, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Thumb slug={card.slug} cover={card.cover} radius={12} style={styles.thumb}>
        {card.state === 'live' && (
          <View style={styles.badge}>
            <LiveBadge small />
          </View>
        )}
      </Thumb>
      <View style={styles.text}>
        <Type v="titleSm" numberOfLines={1}>
          {name}
        </Type>
        {!!sub && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {sub}
          </Type>
        )}
        {card.state === 'live' && viewers !== null && (
          <Type v="bodySm" tone="onSurfaceVariant" numeric>
            {viewers} {t('ld_watching')}
          </Type>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg + 2, borderWidth: 1, padding: 10 },
  thumb: { width: 120, height: 72 },
  badge: { padding: 6 },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
