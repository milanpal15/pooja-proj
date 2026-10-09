import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Space } from '@/theme';

import { LiveBadge, Thumb } from './LiveBits';

/** A row of other live streams. */
export function MoreLive({ cards, onOpen }: { cards: LiveCard[]; onOpen: (c: LiveCard) => void }) {
  const { lang } = useLanguage();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {cards.map((card) => (
        <Pressable key={card.slug} accessibilityRole="button" onPress={() => onOpen(card)} style={styles.item}>
          <Thumb slug={card.slug} cover={card.cover} radius={14} style={styles.thumb}>
            <View style={styles.badge}>
              <LiveBadge small />
            </View>
          </Thumb>
          <Type v="labelMd" numberOfLines={2}>
            {pick(lang, card.templeName, card.templeNameHi)}
          </Type>
          <Type v="labelSm" tone="onSurfaceVariant" numberOfLines={1}>
            {card.place}
          </Type>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingHorizontal: Space.margin },
  item: { width: 150, gap: 2 },
  thumb: { height: 92, marginBottom: 4 },
  badge: { padding: 6 },
});
