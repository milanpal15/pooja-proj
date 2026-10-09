import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import { type ComposedGesture, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { Thali } from '@/components/illustrations/thali';

/** The only draggable thing in the sanctum, with its "grab me" pulse ring. */
export function AartiThali({
  gesture,
  left,
  top,
  thaliStyle,
  grabHintStyle,
}: {
  gesture: ReturnType<typeof Gesture.Pan> | ComposedGesture;
  left: number;
  top: number;
  thaliStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  grabHintStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
}) {
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.thali, { left, top }, thaliStyle]}>
        {/* Pulse ring hinting that the plate is the thing to grab. */}
        <Animated.View style={[styles.grabHint, grabHintStyle]} />
        <Thali size={104} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  thali: {
    position: 'absolute',
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  grabHint: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#FFE9A8',
  },
});
