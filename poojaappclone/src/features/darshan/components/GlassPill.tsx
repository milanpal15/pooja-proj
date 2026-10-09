import { Pressable, StyleSheet } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, useTheme } from '@/theme';

export function GlassPill({
  icon,
  label,
  filled = false,
  onPress,
  accessibilityLabel,
}: {
  icon: 'heart' | 'share';
  /** Optional — omitted when there is no real number to report. */
  label?: string;
  filled?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderColor: c.goldHairline,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Icon name={icon} size={17} color={filled ? c.primary : c.goldInk} filled={filled} />
      {/* Without a label the pill collapses to a round icon button, rather
          than leaving a gap where an invented number used to sit. */}
      {!!label && (
        <Type v="labelMd" tone="goldInk" numeric>
          {label}
        </Type>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
});
