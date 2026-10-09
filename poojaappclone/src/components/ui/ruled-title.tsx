/** `RuledTitle` — a bold centred heading between two orange rules that fade outwards. */

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Saffron } from '@/theme';

import { Type } from './type';

const FADE_IN = ['rgba(233,138,30,0)', Saffron[400]] as const;
const FADE_OUT = [Saffron[400], 'rgba(233,138,30,0)'] as const;

export function RuledTitle({ children }: { children: string }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <LinearGradient colors={FADE_IN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
      <Type v="titleMd" center style={{ flexShrink: 1 }}>
        {children}
      </Type>
      <LinearGradient colors={FADE_OUT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 2, minWidth: 16 },
});
