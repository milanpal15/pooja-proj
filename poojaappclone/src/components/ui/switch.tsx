/**
 * `Switch` — an on/off setting.
 *
 * The platform switch draws a grey Material track and a thumb that ignores the
 * sanctum palette, and its hit area is the size of the drawing. This one is a
 * 44pt target (the minimum, even though the track is smaller), announces
 * itself as a switch with its checked state, and uses kumkum for "on" like
 * every other active state in the kit.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space, useTheme } from '@/theme';

import { Type } from './type';

export type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Shown beside the control and used as its accessible name. */
  label?: string;
  /** Accessible name when the visible label lives elsewhere in the layout. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

const TRACK_W = 48;
const TRACK_H = 28;
const THUMB = 20;

export function Switch({
  value,
  onValueChange,
  label,
  accessibilityLabel,
  disabled = false,
}: SwitchProps) {
  const { c } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.hit,
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}>
      {!!label && (
        <Type v="bodyMd" style={styles.label}>
          {label}
        </Type>
      )}
      <View
        style={[
          styles.track,
          { backgroundColor: value ? c.primary : c.outline },
        ]}>
        <View
          style={[
            styles.thumb,
            {
              backgroundColor: c.containerLowest,
              transform: [{ translateX: value ? TRACK_W - THUMB - 8 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.sm,
  },
  label: { flexShrink: 1 },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: Radius.full,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.full,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
