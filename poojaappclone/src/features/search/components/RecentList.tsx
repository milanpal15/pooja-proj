import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/** Recent searches: tap to run again, x to forget one, "Clear all" to forget everything. */
export function RecentList({
  items,
  title,
  clearAllLabel,
  clearAllA11y,
  removeLabel,
  onPick,
  onRemove,
  onClear,
}: {
  items: string[];
  title: string;
  clearAllLabel: string;
  clearAllA11y: string;
  /** `Remove {q} from recent searches` with the placeholder still in it. */
  removeLabel: string;
  onPick: (q: string) => void;
  onRemove: (q: string) => void;
  onClear: () => void;
}) {
  const { c } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Type v="titleMd" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Type>
        <Pressable accessibilityRole="button" accessibilityLabel={clearAllA11y} onPress={onClear} style={styles.clearAll}>
          <Type v="labelMd" tone="primary">
            {clearAllLabel}
          </Type>
        </Pressable>
      </View>
      {items.map((q) => (
        <View key={q} style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => onPick(q)} style={styles.pick}>
            <Icon name="search" size={16} color={c.onSurfaceFaint} />
            <Type v="bodyMd" numberOfLines={1} style={{ flex: 1 }}>
              {q}
            </Type>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={removeLabel.replace('{q}', q)}
            onPress={() => onRemove(q)}
            style={styles.remove}>
            <Icon name="close" size={16} color={c.onSurfaceFaint} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  clearAll: { minHeight: 44, justifyContent: 'center', paddingLeft: Space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  pick: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Space.md },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
