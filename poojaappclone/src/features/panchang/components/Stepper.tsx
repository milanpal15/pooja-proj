import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui';
import { Radius, useTheme } from '@/theme';

export function Stepper({ icon, label, onPress }: { icon: 'back' | 'forward'; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.step,
        { borderColor: c.goldHairline, backgroundColor: c.containerLowest },
        pressed && { opacity: 0.7 },
      ]}>
      <Icon name={icon} size={16} color={c.goldInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  step: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
