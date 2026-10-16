import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

/** Tap-to-search chips built from real names. 44px tall. */
export function SuggestionChips({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  const { c } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.wrap}>
      {items.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="button"
          accessibilityLabel={s}
          onPress={() => onPick(s)}
          style={({ pressed }) => [styles.chip, { backgroundColor: c.containerLowest, borderColor: c.goldHairline, opacity: pressed ? 0.85 : 1 }]}>
          <Type v="labelMd" tone="goldInk">
            {s}
          </Type>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: Radius.full, borderWidth: 1.2, justifyContent: 'center' },
});
