import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { LiveCard } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Space, useTheme } from '@/theme';

import { Thumb } from './LiveBits';

/** Saved temples that have a stream, as avatars. Red ring = live right now. */
export function SavedStrip({ cards, onOpen }: { cards: LiveCard[]; onOpen: (c: LiveCard) => void }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {cards.map((card) => {
        const live = card.state === 'live';
        const name = pick(lang, card.templeName, card.templeNameHi);
        return (
          <Pressable
            key={card.slug}
            accessibilityRole="button"
            accessibilityLabel={name}
            onPress={() => onOpen(card)}
            style={styles.item}>
            <View style={[styles.ring, { borderColor: live ? c.live : c.outlineVariant }]}>
              <Thumb slug={card.slug} cover={card.cover} radius={29} style={styles.avatar} />
            </View>
            <Type v="labelSm" tone={live ? 'onSurface' : 'onSurfaceVariant'} center numberOfLines={1}>
              {name}
            </Type>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingHorizontal: Space.margin },
  item: { width: 76, alignItems: 'center', gap: 6 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 58, height: 58 },
});
