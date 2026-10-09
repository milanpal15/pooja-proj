import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Type } from '@/components/ui';
import { Saffron, useTheme } from '@/theme';

import type { SectionKey } from '../lib/sections';

/** The sticky tab bar: tapping scrolls to that section. */
export function SectionTabs({
  items,
  active,
  onPick,
}: {
  items: { key: SectionKey; label: string }[];
  active?: SectionKey;
  onPick: (key: SectionKey) => void;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: c.surface, borderBottomColor: c.outlineVariant, borderBottomWidth: 1 }}
      contentContainerStyle={styles.row}>
      {items.map((i) => {
        const on = i.key === active;
        return (
          <Pressable
            key={i.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(i.key)}
            style={[styles.tab, on && { borderBottomColor: Saffron[400] }]}>
            <Type v="labelLg" tone={on ? 'primary' : 'onSurfaceVariant'} style={{ fontSize: 14 }}>
              {i.label}
            </Type>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 22 },
  tab: { minHeight: 46, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
});
