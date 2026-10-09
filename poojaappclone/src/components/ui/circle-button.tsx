/** `CircleButton` — the design's white, bordered, round 44px control (back, share, search). */

import { Pressable } from 'react-native';

import { Radius, useTheme } from '@/theme';

import { Icon, type IconName } from './icon';

export function CircleButton({
  name,
  label,
  onPress,
  size = 44,
  active = false,
}: {
  name: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  onPress: () => void;
  size?: number;
  active?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: active ? c.primary : c.outlineVariant,
        backgroundColor: c.containerLowest,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}>
      <Icon name={name} size={Math.round(size * 0.46)} color={active ? c.primary : c.onSurface} strokeWidth={2} />
    </Pressable>
  );
}
