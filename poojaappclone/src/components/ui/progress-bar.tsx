/** `ProgressBar` — a horizontal meter: balance against a price, a call's remaining time. */

import { StyleSheet, View } from 'react-native';

import { Radius, useTheme } from '@/theme';

export type ProgressBarProps = {
  value: number;
  max: number;
  tone?: 'success' | 'danger' | 'accent';
};

export function ProgressBar({ value, max, tone = 'accent' }: ProgressBarProps) {
  const { c } = useTheme();
  const fill = tone === 'success' ? c.success : tone === 'danger' ? c.error : c.accent;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: Math.max(0, Math.round(max)), now: Math.round(value) }}
      style={[styles.track, { backgroundColor: c.container }]}>
      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: fill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, borderRadius: Radius.full, overflow: 'hidden' },
});
