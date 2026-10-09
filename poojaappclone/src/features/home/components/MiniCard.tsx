import { Pressable, StyleSheet, View } from 'react-native';

import { CoinDisc, Type } from '@/components/ui';
import { useTheme } from '@/theme';

import { Banner } from './Banner';

export const MINI_W = 220;

/** A 220-wide shelf card: artwork with the title over it, then a place/date line and a coin price. */
export function MiniCard({
  seed,
  uri,
  title,
  line,
  price,
  bannerH = 110,
  onPress,
}: {
  seed: string;
  uri?: string;
  title: string;
  line: string;
  price: string;
  bannerH?: number;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Banner uri={uri} seed={seed} style={{ height: bannerH }}>
        <View style={styles.over}>
          <Type v="titleSm" color="#FFFFFF" numberOfLines={2} style={styles.title}>
            {title}
          </Type>
        </View>
      </Banner>
      <View style={styles.body}>
        {!!line && (
          <Type v="labelSm" tone="onSurfaceVariant" numberOfLines={1}>
            {line}
          </Type>
        )}
        <View style={styles.price}>
          <CoinDisc size={16} />
          <Type v="titleSm" tone="goldInk">
            {price}
          </Type>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: MINI_W, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  over: { ...StyleSheet.absoluteFill, padding: 12, justifyContent: 'flex-end' },
  title: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  body: { padding: 12, gap: 6 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
