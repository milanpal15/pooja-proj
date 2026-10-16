import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

/** One avatar: a dashboard deity, or any custom card an operator wrote (own picture, own link). */
export type DeityEntry = { id: string; name: string; accent: string; source?: ImageSourcePropType; href?: string };

/**
 * The deity "stories" row. Each avatar is the dashboard's artwork when there is
 * some, else the deity's initial on its own accent colour; tapping opens that
 * deity in the Pooja tab. The gold ring is a plain border — RN has no conic gradient.
 */
export function DeityRow({ entries, onPick }: { entries: DeityEntry[]; onPick: (entry: DeityEntry) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {entries.map((d) => {
        const img = d.source;
        return (
          <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={d.name} onPress={() => onPick(d)} style={styles.item}>
            <View style={[styles.ring, { borderColor: c.gold }]}>
              {img ? (
                <Image source={img} style={styles.face} resizeMode="cover" />
              ) : (
                <View style={[styles.face, { backgroundColor: d.accent }]}>
                  <Type v="titleMd" color="#FFFFFF">
                    {Array.from(d.name)[0]}
                  </Type>
                </View>
              )}
            </View>
            <Type v="labelSm" tone="onSurfaceVariant" center numberOfLines={1}>
              {d.name}
            </Type>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 10 },
  item: { width: 68, alignItems: 'center', gap: 6 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, padding: 2 },
  face: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
