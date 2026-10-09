import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';
import { useTheme } from '@/theme';

export type QuickItem = { key: string; label: string; icon: IconName; href: string; badge?: string };

/** The 4-column service grid. LIVE is a corner badge; the glyph takes the primary role colour. */
export function QuickGrid({ items, onOpen }: { items: QuickItem[]; onOpen: (href: string) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <Pressable
          key={it.key}
          accessibilityRole="button"
          accessibilityLabel={it.badge ? `${it.label}, ${it.badge}` : it.label}
          onPress={() => onOpen(it.href)}
          style={({ pressed }) => [styles.cell, pressed && { opacity: 0.75 }]}>
          <View style={[styles.box, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
            <Icon name={it.icon} size={26} color={c.primary} />
          </View>
          {!!it.badge && (
            <View style={[styles.badge, { backgroundColor: c.live }]}>
              <Type v="labelSm" color="#FFFFFF" style={styles.badgeText}>
                {it.badge}
              </Type>
            </View>
          )}
          <Type v="labelSm" tone="onSurfaceVariant" center numberOfLines={2} style={styles.label}>
            {it.label}
          </Type>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  cell: { width: '25%', alignItems: 'center', gap: 7, paddingHorizontal: 4 },
  box: { width: 60, height: 60, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, lineHeight: 12 },
  label: { fontSize: 11.5, lineHeight: 14, letterSpacing: 0 },
});
