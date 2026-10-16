import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

export function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.head}>
      <Type v="titleMd">{title}</Type>
    </View>
  );
}

/** "Completed · 3" — a quiet strip with the titles; the caller renders it only when the count is above 0. */
export function CompletedStrip({ label, titles }: { label: string; titles: string[] }) {
  const { c } = useTheme();
  return (
    <View style={[styles.strip, { backgroundColor: c.container, borderColor: c.outlineVariant }]}>
      <Icon name="check" size={18} color={c.success} />
      <View style={styles.text}>
        <Type v="labelMd">{label}</Type>
        {titles.length > 0 && (
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={2}>
            {titles.join(' · ')}
          </Type>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Space.margin },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
  text: { flex: 1, gap: 2 },
});
