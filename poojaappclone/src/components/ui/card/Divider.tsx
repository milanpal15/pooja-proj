import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

export function Divider({ inset = 0, gold = false }: { inset?: number; gold?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth * 2,
        marginLeft: inset,
        backgroundColor: gold ? c.goldHairline : c.outlineVariant,
      }}
    />
  );
}
