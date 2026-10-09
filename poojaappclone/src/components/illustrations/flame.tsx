import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Fakes a radial gradient with stacked circles. Cheaper than pulling in a
 * gradient dependency and good enough for a soft lamp glow.
 */
export function Glow({
  size,
  color,
  intensity = 1,
  rings = 4,
}: {
  size: number;
  color: string;
  intensity?: number;
  rings?: number;
}) {
  return (
    <View pointerEvents="none" style={[styles.centered, { width: size, height: size }]}>
      {Array.from({ length: rings }).map((_, i) => {
        const t = (i + 1) / rings;
        const d = size * t;
        return (
          <View
            key={i}
            style={[
              styles.absolute,
              {
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: color,
                // Outer rings are large and faint, inner rings small and bright.
                opacity: ((1 - t) * 0.28 + 0.04) * intensity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * A diya flame: three stacked teardrops that flicker independently so the
 * motion never looks like a single scaling sprite.
 */
export function Flame({ size = 26, color = '#FFB63D' }: { size?: number; color?: string }) {
  const flicker = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    // Uneven durations keep the loop from reading as a metronome.
    flicker.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 210 }),
        withTiming(0.32, { duration: 150 }),
        withTiming(0.88, { duration: 290 }),
        withTiming(0.18, { duration: 180 }),
      ),
      -1,
      true,
    );
    sway.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [flicker, sway]);

  const outer = useAnimatedStyle(() => ({
    transform: [
      { translateX: (sway.value - 0.5) * size * 0.16 },
      { scaleY: 0.9 + flicker.value * 0.35 },
      { scaleX: 1.04 - flicker.value * 0.12 },
    ],
    opacity: 0.75 + flicker.value * 0.25,
  }));

  const inner = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.85 + flicker.value * 0.3 }],
    opacity: 0.85 + flicker.value * 0.15,
  }));

  const core = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.8 + flicker.value * 0.25 }],
    opacity: 0.7 + flicker.value * 0.3,
  }));

  return (
    <View style={[styles.centered, { width: size * 1.6, height: size * 2 }]}>
      <Glow size={size * 5} color={color} intensity={1} />
      <Animated.View
        style={[
          styles.absolute,
          teardrop(size * 0.92, size * 1.5, color),
          { opacity: 0.55 },
          outer,
        ]}
      />
      <Animated.View
        style={[styles.absolute, teardrop(size * 0.58, size * 1.0, '#FFD98A'), inner]}
      />
      <Animated.View
        style={[styles.absolute, teardrop(size * 0.3, size * 0.52, '#FFFBEA'), core]}
      />
    </View>
  );
}

/** Teardrop = a circle with the top corners pulled to a point. */
function teardrop(w: number, h: number, backgroundColor: string) {
  return {
    width: w,
    height: h,
    backgroundColor,
    borderBottomLeftRadius: w / 2,
    borderBottomRightRadius: w / 2,
    borderTopLeftRadius: w / 2,
    borderTopRightRadius: w * 0.06,
  } as const;
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  absolute: { position: 'absolute' },
});
