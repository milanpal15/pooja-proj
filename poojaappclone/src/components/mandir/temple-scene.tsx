import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Glow } from '@/components/pooja/flame';
import { mixHex } from '@/constants/color';

/** Warm sanctum backdrop: light wash, stone pillars and a glow behind the murti. */
export function TempleBackdrop({
  width,
  height,
  accent,
}: {
  width: number;
  height: number;
  accent: string;
}) {
  const bands = 12;
  const top = '#8C6626';
  const bottom = '#2E1D0B';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: bands }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: (height / bands) * i,
            left: 0,
            right: 0,
            height: height / bands + 1,
            backgroundColor: mixHex(top, bottom, i / (bands - 1)),
          }}
        />
      ))}

      {/* Stone pillars flanking the sanctum */}
      {[0, 1].map((side) => (
        <View
          key={side}
          style={[
            styles.pillar,
            side === 0 ? { left: -10 } : { right: -10 },
            { height: height * 0.72 },
          ]}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={styles.pillarBand} />
          ))}
        </View>
      ))}

      {/* Halo of light in the centre of the shrine */}
      <View style={[styles.centreGlow, { top: height * 0.16 }]}>
        <Glow size={width * 1.15} color={accent} rings={5} intensity={0.55} />
      </View>
    </View>
  );
}

/**
 * The decorative gold toran across the top of the shrine: a scalloped valance
 * with a lotus at the crown and beaded strings hanging from the arch.
 */
export function Toran({ width }: { width: number }) {
  const scallops = Math.ceil(width / 26);

  return (
    <View style={[styles.toran, { width }]} pointerEvents="none">
      <View style={[styles.toranBody, { width }]}>
        {/* Beaded trim running along the top */}
        <View style={styles.beadRow}>
          {Array.from({ length: Math.ceil(width / 16) }).map((_, i) => (
            <View key={i} style={styles.bead} />
          ))}
        </View>

        {/* Lotus motif at the crown */}
        <View style={styles.lotus}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View
              key={i}
              style={[styles.lotusPetal, { transform: [{ rotate: `${(i - 3) * 24}deg` }] }]}
            />
          ))}
        </View>
      </View>

      {/* Scalloped lower edge */}
      <View style={[styles.scallopRow, { width }]}>
        {Array.from({ length: scallops }).map((_, i) => (
          <View key={i} style={styles.scallop} />
        ))}
      </View>
    </View>
  );
}

/**
 * A brass temple bell on a rope. Tapping it swings the bell once; while
 * `ringing` is true (e.g. during Auto Aarti) it sways back and forth on a loop.
 */
export function HangingBell({
  side,
  onRing,
  ringing = false,
}: {
  side: 'left' | 'right';
  onRing?: () => void;
  ringing?: boolean;
}) {
  const swing = useSharedValue(0);
  const idle = useSharedValue(0);

  useEffect(() => {
    // A barely-there idle drift so the bells never look frozen.
    idle.value = withRepeat(withTiming(1, { duration: 3400 }), -1, true);
  }, [idle]);

  // Continuous pendulum sway during the aarti; the two bells swing in opposite
  // phase so they read like a real pair being rung.
  useEffect(() => {
    if (ringing) {
      const from = side === 'left' ? 1 : -1;
      swing.value = from * 0.6;
      swing.value = withRepeat(
        withSequence(
          withTiming(-from, { duration: 300, easing: Easing.inOut(Easing.sin) }),
          withTiming(from, { duration: 300, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(swing);
      swing.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) });
    }
  }, [ringing, side, swing]);

  const ring = () => {
    swing.value = withSequence(
      withTiming(1, { duration: 90 }),
      withTiming(-0.8, { duration: 150 }),
      withTiming(0.55, { duration: 150 }),
      withTiming(-0.3, { duration: 150 }),
      withTiming(0, { duration: 180 }),
    );
    onRing?.();
  };

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -46 },
      { rotate: `${swing.value * 17 + (idle.value - 0.5) * 2.5}deg` },
      { translateY: 46 },
    ],
  }));

  return (
    <Pressable
      onPress={ring}
      hitSlop={14}
      style={[styles.bellAnchor, side === 'left' ? { left: 18 } : { right: 18 }]}>
      <Animated.View style={[styles.bellPivot, style]}>
        <View style={styles.rope} />
        <View style={styles.bellCrown} />
        <View style={styles.bellBody}>
          <View style={styles.bellShine} />
        </View>
        <View style={styles.bellLip} />
        <View style={styles.clapper} />
      </Animated.View>
    </Pressable>
  );
}

const GOLD = '#E8B33C';
const GOLD_DARK = '#A9761C';
const BRASS = '#D8A63C';

const styles = StyleSheet.create({
  pillar: {
    position: 'absolute',
    top: 0,
    width: 54,
    backgroundColor: 'rgba(90,62,28,0.30)',
    justifyContent: 'space-evenly',
    borderRadius: 6,
  },
  pillarBand: { height: 5, backgroundColor: 'rgba(60,40,16,0.28)' },
  centreGlow: { position: 'absolute', alignSelf: 'center' },

  toran: { position: 'absolute', top: 0, alignItems: 'center', zIndex: 5 },
  toranBody: {
    height: 62,
    backgroundColor: GOLD,
    borderBottomWidth: 3,
    borderBottomColor: GOLD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beadRow: { position: 'absolute', top: 8, flexDirection: 'row', gap: 8 },
  bead: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF0C2', opacity: 0.85 },
  lotus: { flexDirection: 'row', marginTop: 14 },
  lotusPetal: {
    width: 9,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#FFF3CB',
    opacity: 0.9,
    marginHorizontal: -2,
  },
  scallopRow: { flexDirection: 'row', marginTop: -1, justifyContent: 'center' },
  scallop: {
    width: 26,
    height: 26,
    borderBottomLeftRadius: 13,
    borderBottomRightRadius: 13,
    backgroundColor: GOLD,
    borderBottomWidth: 3,
    borderBottomColor: GOLD_DARK,
    marginHorizontal: -1,
  },

  bellAnchor: { position: 'absolute', top: 58, alignItems: 'center', zIndex: 6 },
  bellPivot: { alignItems: 'center' },
  rope: { width: 3, height: 46, backgroundColor: '#7B4B22', borderRadius: 2 },
  bellCrown: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: BRASS,
    marginBottom: -2,
  },
  bellBody: {
    width: 42,
    height: 38,
    backgroundColor: BRASS,
    borderTopLeftRadius: 21,
    borderTopRightRadius: 21,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
  },
  bellShine: {
    position: 'absolute',
    left: 8,
    top: 6,
    width: 7,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#FFE9A8',
    opacity: 0.7,
  },
  bellLip: {
    width: 50,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C08F2A',
    marginTop: -2,
  },
  clapper: { width: 6, height: 9, borderRadius: 3, backgroundColor: '#8A6318', marginTop: -1 },
});
