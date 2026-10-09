import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';
import { useTheme } from '@/theme';

export type Action = { key: string; icon: IconName; label: string; active?: boolean; onPress: () => void };

/** Four tiles: Offer chadhava / Book pooja / Remind me / Navigate. */
export function ActionGrid({ actions }: { actions: Action[] }) {
  const { c } = useTheme();
  return (
    <View style={styles.grid}>
      {actions.map((a) => (
        <Pressable key={a.key} accessibilityRole="button" onPress={a.onPress} style={styles.item}>
          <View
            style={[
              styles.tile,
              { backgroundColor: a.active ? c.accentContainer : c.containerLowest, borderColor: c.outlineVariant },
            ]}>
            <Icon name={a.icon} size={26} color={c.primary} filled={a.active} />
          </View>
          <Type v="labelSm" tone="onSurfaceVariant" center>
            {a.label}
          </Type>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, alignItems: 'center', gap: 6 },
  tile: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
