/**
 * `BottomBar` — the pinned strip under a scrolling form that holds its one
 * action (Confirm, Offer, Pay). Clears the gesture bar by the safe-area inset,
 * and stacks its children (a status line above the button, say) with a gap.
 */

import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Space, useTheme } from '@/theme';

export function BottomBar({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: c.surface,
          borderTopColor: c.outlineVariant,
          paddingBottom: Math.max(insets.bottom, Space.md),
        },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: Space.margin, paddingTop: Space.sm + 4, gap: Space.sm, borderTopWidth: 1 },
});
