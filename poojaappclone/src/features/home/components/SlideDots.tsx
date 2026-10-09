import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/** Pager dots: the current one is a longer primary pill. */
export function SlideDots({ count, active }: { count: number; active: number }) {
  const { c } = useTheme();
  if (count < 2) return null;
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.dot, i === active ? { width: 18, backgroundColor: c.primary } : { width: 6, backgroundColor: c.outlineVariant }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { height: 6, borderRadius: 3 },
});
