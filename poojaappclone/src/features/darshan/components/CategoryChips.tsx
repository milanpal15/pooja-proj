import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

export type ChipItem = { key: string; label: string };

/** Horizontal filter chips; the selected one is filled primary with onPrimary text. */
export function CategoryChips({
  items,
  selected,
  onSelect,
}: {
  items: ChipItem[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}>
      {items.map((it) => {
        const on = it.key === selected;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(it.key)}
            style={[
              styles.chip,
              { backgroundColor: on ? c.primary : c.containerLowest, borderColor: on ? c.primary : c.outlineVariant },
            ]}>
            <Type v="labelLg" color={on ? c.onPrimary : c.onSurfaceVariant} numberOfLines={1}>
              {it.label}
            </Type>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: Space.sm, paddingHorizontal: Space.margin, paddingVertical: 2 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center' },
});
