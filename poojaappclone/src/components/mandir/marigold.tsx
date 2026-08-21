import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Stable pseudo-random from an index, so blooms don't reshuffle each render. */
function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A marigold pom: a ring of petals around a darker centre. */
export function Marigold({ size = 26, hue = 0 }: { size?: number; hue?: number }) {
  const outer = hue > 0.5 ? '#F5A623' : '#F08C1B';
  const inner = hue > 0.5 ? '#FFC94D' : '#F5A623';
  const petals = 8;

  return (
    <View style={[styles.bloom, { width: size, height: size }]}>
      {Array.from({ length: petals }).map((_, i) => {
        const a = (i / petals) * Math.PI * 2;
        const r = size * 0.28;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: size * 0.46,
              height: size * 0.46,
              borderRadius: size * 0.23,
              backgroundColor: outer,
              transform: [{ translateX: Math.cos(a) * r }, { translateY: Math.sin(a) * r }],
            }}
          />
        );
      })}
      <View
        style={{
          width: size * 0.52,
          height: size * 0.52,
          borderRadius: size * 0.26,
          backgroundColor: inner,
        }}
      />
    </View>
  );
}

function FallingBloom({
  index,
  width,
  height,
}: {
  index: number;
  width: number;
  height: number;
}) {
  const t = useSharedValue(0);

  const startX = hash01(index) * width;
  const drift = (hash01(index + 40) - 0.5) * 110;
  const duration = 5000 + hash01(index + 80) * 4500;
  /** Per-bloom offset into the fall cycle. */
  const phase = hash01(index + 120);
  const size = 18 + hash01(index + 160) * 16;
  const spin = hash01(index + 200) > 0.5 ? 1 : -1;

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [t, duration]);

  const style = useAnimatedStyle(() => {
    // Offsetting the phase inside the loop (rather than delaying the start)
    // means the shrine already has flowers mid-fall on the very first frame.
    const p = (t.value + phase) % 1;
    return {
      transform: [
        { translateY: interpolate(p, [0, 1], [-40, height + 40]) },
        // Sway as it falls rather than dropping straight down.
        { translateX: Math.sin(p * Math.PI * 2.4) * drift },
        { rotate: `${p * 300 * spin}deg` },
      ],
      opacity: interpolate(p, [0, 0.08, 0.88, 1], [0, 1, 0.95, 0]),
    };
  });

  return (
    <Animated.View style={[styles.faller, { left: startX }, style]}>
      <Marigold size={size} hue={hash01(index + 240)} />
    </Animated.View>
  );
}

/** Marigold blossoms raining through the shrine. */
export function MarigoldRain({
  count = 14,
  width,
  height,
}: {
  count?: number;
  width: number;
  height: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => (
        <FallingBloom key={i} index={i} width={width} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bloom: { alignItems: 'center', justifyContent: 'center' },
  faller: { position: 'absolute', top: 0 },
});
