import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui';
import { Radius, useTheme } from '@/theme';

export function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.roundBtn,
        { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 },
      ]}>
      <Icon name={icon} size={20} color={c.onAccent} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
