import { Pressable, StyleSheet } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useTheme } from '@/theme';

/** The Home search box. A tap opens the Search screen with its keyboard up. */
export function SearchBar({ placeholder, onPress }: { placeholder: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      style={[styles.box, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Icon name="search" size={20} color={c.onSurfaceFaint} />
      <Type v="bodyMd" tone="onSurfaceFaint" numberOfLines={1} style={styles.label}>
        {placeholder}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { height: 48, borderRadius: 24, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  label: { flex: 1, fontSize: 14 },
});
