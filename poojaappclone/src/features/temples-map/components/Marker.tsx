import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Glow } from '@/components/illustrations/flame';
import { mixHex } from '@/constants/color';
import type { Temple } from '@/constants/temples';

import { SPRING } from '../constants/camera';

export function Marker({
  temple,
  selected,
  onPress,
}: {
  temple: Temple;
  selected: boolean;
  onPress: () => void;
}) {
  const lift = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1.25 : 1, SPRING) }, { translateY: lift.value }],
  }));

  const pulse = useAnimatedStyle(() => ({
    opacity: withTiming(selected ? 1 : 0, { duration: 260 }),
  }));

  return (
    <Animated.View
      style={[styles.marker, { left: temple.map.x - 48, top: temple.map.y - 52 }, style]}>
      <Animated.View style={[styles.markerGlow, pulse]}>
        <Glow size={110} color={temple.accent} rings={4} />
      </Animated.View>
      <Pressable
        onPress={onPress}
        onPressIn={() => (lift.value = withSpring(-4))}
        onPressOut={() => (lift.value = withSpring(0))}
        hitSlop={10}
        style={styles.markerHit}>
        <View
          style={[
            styles.pin,
            {
              backgroundColor: mixHex('#0A0A0A', temple.idol, selected ? 0.85 : 0.55),
              borderColor: selected ? temple.accent : temple.trim,
            },
          ]}>
          <Text style={[styles.pinMark, { color: temple.accent }]}>{temple.mark}</Text>
        </View>
        <View style={[styles.pinStem, { backgroundColor: selected ? temple.accent : temple.trim }]} />
        <Text
          numberOfLines={1}
          style={[styles.pinLabel, { color: selected ? '#fff' : 'rgba(255,255,255,0.55)' }]}>
          {temple.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  marker: { position: 'absolute', width: 96, alignItems: 'center' },
  markerGlow: { position: 'absolute', top: -18, alignItems: 'center', justifyContent: 'center' },
  markerHit: { alignItems: 'center' },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinMark: { fontSize: 16, fontWeight: '700' },
  pinStem: { width: 2, height: 12, opacity: 0.8 },
  pinLabel: { fontSize: 10, fontWeight: '600', maxWidth: 96, textAlign: 'center' },
});
