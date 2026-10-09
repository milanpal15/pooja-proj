import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { contrast, grade, Radius, Space, useTheme } from '@/theme';

import type { Pair } from '../constants/samples';

export function ContrastRow({ fg, bg, label, ornament, last }: Pair & { last: boolean }) {
  const { c, isSanctum } = useTheme();
  const fgHex = c[fg] as string;
  const bgHex = c[bg] as string;
  // Pass the surface as the base so translucent container tokens — most of
  // the sanctum's — flatten onto what's actually behind them.
  const ratio = contrast(fgHex, bgHex, c.surface);
  const g = grade(ratio);
  // Text that fails is a bug. `gold` is expected to fail on cream, which is
  // why it is ornament — but on the dark sanctum it legitimately passes, so
  // the expectation only applies to the light surface.
  const bad = ornament ? !isSanctum && g !== 'Fail' : g === 'Fail';
  const verdict = ornament && !isSanctum ? (g === 'Fail' ? 'ornament ✓' : 'too strong') : g;

  return (
    <View
      style={[
        styles.swatchRow,
        !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant },
      ]}>
      <View style={[styles.swatch, { backgroundColor: bgHex, borderColor: c.outlineVariant }]}>
        <Type v="titleSm" color={fgHex}>
          Aa
        </Type>
      </View>
      <View style={{ flex: 1 }}>
        <Type v="titleSm">{label}</Type>
        <Type v="labelSm" tone="onSurfaceFaint">
          {fg} on {bg}
        </Type>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Type v="labelMd" numeric tone={bad ? 'error' : 'onSurface'}>
          {ratio ? `${ratio.toFixed(2)}:1` : '—'}
        </Type>
        <Type v="labelSm" tone={bad ? 'error' : 'success'}>
          {verdict}
        </Type>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 10,
    paddingHorizontal: Space.cardPadding,
  },
  swatch: {
    width: 44,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
