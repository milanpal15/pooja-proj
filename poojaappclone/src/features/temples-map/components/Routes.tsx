import { StyleSheet, View } from 'react-native';

import type { Temple } from '@/constants/temples';

import { routeDots } from '../lib/route-dots';

/** Dotted pilgrimage routes linking the temples in order. */
export function Routes({ temples }: { temples: Temple[] }) {
  const dots = routeDots(temples);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d) => (
        <View key={d.key} style={[styles.routeDot, { left: d.x - 2, top: d.y - 2 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  routeDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
