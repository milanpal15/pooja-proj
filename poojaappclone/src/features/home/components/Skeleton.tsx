import { useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/** A softly pulsing placeholder block shown while a Home block's data loads. */
export function Skeleton({ style }: { style: ViewStyle }) {
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

  return <Animated.View accessibilityElementsHidden importantForAccessibility="no" style={[{ backgroundColor: c.container, opacity: v, borderRadius: 20 }, style]} />;
}
