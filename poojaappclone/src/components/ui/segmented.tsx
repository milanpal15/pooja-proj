/**
 * Segmented control — the "Amount | Item" switch on e-Chadhava, and any
 * two-to-three-way choice where tabs would be too heavy.
 *
 * The export drew this once, with a white thumb on a grey track. Grey appears
 * nowhere else in the system, so the track is a tonal container here and the
 * thumb picks up the card surface.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, useTheme } from '@/theme';

import { Type } from './type';

export type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch to fill the container. */
  block?: boolean;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  block = true,
}: SegmentedProps<T>) {
  const { c, elevation } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        { backgroundColor: c.container, alignSelf: block ? 'stretch' : 'flex-start' },
      ]}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.seg,
              on && [{ backgroundColor: c.containerLowest }, elevation.low, { shadowColor: c.glowTint }],
              pressed && !on ? { opacity: 0.7 } : null,
            ]}>
            <Type v="labelMd" tone={on ? 'primary' : 'onSurfaceVariant'} numberOfLines={1}>
              {opt.label}
            </Type>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
  },
});
