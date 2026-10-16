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
  chip,
  bannerH = 110,
  onPress,
}: {
  seed: string;
  uri?: string;
  title: string;
  line: string;
  /** Absent = no price row (a live stream has none). */
  price?: string;
  /** A corner chip over the artwork, e.g. LIVE. */
  chip?: string;
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
        {!!chip && (
          <View style={[styles.chip, { backgroundColor: c.live }]}>
            <Type v="labelSm" color="#FFFFFF" style={styles.chipText}>
              {chip}
            </Type>
          </View>
        )}
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
        {!!price && (
          <View style={styles.price}>
            <CoinDisc size={16} />
            <Type v="titleSm" tone="goldInk">
              {price}
            </Type>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: MINI_W, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  over: { ...StyleSheet.absoluteFill, padding: 12, justifyContent: 'flex-end' },
  title: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  body: { padding: 12, gap: 6 },
  chip: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontSize: 10, lineHeight: 13 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
