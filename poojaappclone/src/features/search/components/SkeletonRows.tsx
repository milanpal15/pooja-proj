import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { Radius, useTheme } from '@/theme';

/** Two pulsing placeholder rows while a section's data is on its way. */
export function SkeletonRows({ label }: { label: string }) {
  const { c } = useTheme();
  const [v] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View accessible accessibilityLabel={label} style={{ opacity: v, gap: 8 }}>
      <Animated.View style={[styles.bar, { backgroundColor: c.container }]} />
      <Animated.View style={[styles.bar, { backgroundColor: c.container }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ bar: { height: 56, borderRadius: Radius.md } });
