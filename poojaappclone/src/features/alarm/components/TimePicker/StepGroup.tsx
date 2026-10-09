import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

export function StepGroup({
  label,
  onMinus,
  onPlus,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.stepGroup}>
      <Type v="labelSm" tone="onSurfaceVariant" center>
        {label}
      </Type>
      <View style={styles.stepBtns}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} down`}
          onPress={onMinus}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: c.accent, opacity: pressed ? 0.75 : 1 },
          ]}>
          <Icon name="minus" size={18} color={c.onAccent} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} up`}
          onPress={onPlus}
          style={({ pressed }) => [
            styles.stepBtn,
            { backgroundColor: c.accent, opacity: pressed ? 0.75 : 1 },
          ]}>
          <Icon name="plus" size={18} color={c.onAccent} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepGroup: { flex: 1, alignItems: 'center', gap: 6 },
  stepBtns: { flexDirection: 'row', gap: Space.sm },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
