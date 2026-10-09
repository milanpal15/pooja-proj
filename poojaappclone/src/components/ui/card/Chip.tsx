import { Pressable, StyleSheet } from 'react-native';

import { Radius, useTheme } from '@/theme';

import { Icon, type IconName } from '../icon';
import { Type } from '../type';

/**
 * Selection chips — the amount presets on e-Chadhava, filters on Temples.
 * The export selected these with a navy fill that exists nowhere else in the
 * system; selection is kumkum here, matching every other "active" state.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  trailing,
  plain = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** A trailing glyph, e.g. the `chevronDown` on a filter that opens a sheet. */
  trailing?: IconName;
  /** Neutral ink on white (the design's filter chips) instead of gold ink. */
  plain?: boolean;
}) {
  const { c } = useTheme();
  const ink = selected ? c.onPrimary : plain ? c.onSurfaceVariant : c.goldInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.containerLowest,
          borderColor: selected ? c.primary : plain ? c.outlineVariant : c.goldHairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {!!icon && (
        <Icon name={icon} size={15} color={ink} strokeWidth={2} />
      )}
      <Type v="labelMd" color={ink}>
        {label}
      </Type>
      {!!trailing && <Icon name={trailing} size={14} color={ink} strokeWidth={2} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    borderWidth: 1.2,
    justifyContent: 'center',
  },
});
