import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Stable pseudo-random from an index, so clouds don't reshuffle each render. */
function hash01(n: number) {
  const x = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

/** One rounded lobe with a feathered edge (faint wide halo + solid core). */
function Lobe({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      {/* Soft halo fakes a blurred edge without a blur filter. */}
      <View
        style={{
          position: 'absolute',
          left: x - r * 0.62,
          top: y - r * 0.62,
          width: r * 1.24,
          height: r * 1.24,
          borderRadius: r,
          backgroundColor: '#FFFFFF',
          opacity: 0.28,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: x - r / 2,
          top: y - r / 2,
          width: r,
          height: r,
          borderRadius: r / 2,
          backgroundColor: '#FFFFFF',
        }}
      />
    </>
  );
}

/**
 * A classic cloud: several overlapping lobes forming a puffy top and a flat
 * base, tinted pure white so it reads as a real cloud rather than a grey blob.
 */
function Puff({ scale }: { scale: number }) {
  const s = scale;
  // Lobe layout (in a ~120x60 box) — big centre, smaller shoulders.
  const lobes = [
    { x: 42, y: 34, r: 46 },
    { x: 16, y: 40, r: 32 },
    { x: 70, y: 38, r: 38 },
    { x: 92, y: 44, r: 26 },
    { x: 28, y: 46, r: 26 },
  ];
  return (
    <View style={{ width: 120 * s, height: 64 * s }}>
      <View style={{ transform: [{ scale: s }] }}>
        {/* Flat base bar ties the lobes together */}
        <View
          style={{
            position: 'absolute',
            left: 12,
            top: 40,
            width: 92,
            height: 22,
            borderRadius: 12,
            backgroundColor: '#FFFFFF',
          }}
        />
        {lobes.map((l, i) => (
          <Lobe key={i} x={l.x} y={l.y} r={l.r} />
        ))}
        {/* Faint shaded underside for a touch of depth */}
        <View
          style={{
            position: 'absolute',
            left: 18,
            top: 54,
            width: 84,
            height: 10,
            borderRadius: 6,
            backgroundColor: '#C9D6E0',
            opacity: 0.5,
          }}
        />
      </View>
    </View>
  );
}

function DriftingCloud({
  index,
  width,
  height,
}: {
  index: number;
  width: number;
  height: number;
}) {
  const t = useSharedValue(0);

  // Spread clouds over the FULL map height, not just the top.
  const y = 8 + hash01(index) * (height - 70);
  const scale = 0.5 + hash01(index + 10) * 1.3;
  // Wider opacity range so some are thick and dense, others thin and wispy.
  const opacity = 0.22 + hash01(index + 40) * 0.73;
  const duration = 32000 + hash01(index + 20) * 30000; // slow, lazy drift
  const phase = hash01(index + 30);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [t, duration]);

  const span = width + 340;
  const style = useAnimatedStyle(() => {
    // Offset by phase inside the loop so clouds are already spread on frame 1.
    const p = (t.value + phase) % 1;
    return { transform: [{ translateX: -220 + p * span }] };
  });

  return (
    <Animated.View style={[styles.cloud, { top: y, opacity }, style]}>
      <Puff scale={scale} />
    </Animated.View>
  );
}

/** Slow clouds of varying density drifting all across the map. */
export function Clouds({
  count = 11,
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
        <DriftingCloud key={i} index={i} width={width} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cloud: { position: 'absolute', left: 0 },
});
