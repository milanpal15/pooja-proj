import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

import type { Rashi } from '../constants/rashis';

/** The chosen sign */
export function RashiHeader({ hi, rashi }: { hi: boolean; rashi: Rashi }) {
  const { c } = useTheme();
  return (
    <Card variant="ornate" style={styles.head}>
      <View style={[styles.glyph, { borderColor: c.gold, backgroundColor: c.accentContainer }]}>
        <Type v="numeral" tone="goldInk">
          {rashi.mark}
        </Type>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="headlineMd" tone="goldInk">
          {hi ? rashi.nameHi : rashi.name}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant">
          {rashi.western}
        </Type>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  glyph: {
    width: 62,
    height: 62,
    borderRadius: Radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
