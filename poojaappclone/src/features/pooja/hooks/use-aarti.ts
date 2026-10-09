import { useCallback, useEffect, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AARTI_CIRCLES } from '@/constants/deities';

import { ANGLE_REST, RETURN_SPRING, TOTAL, TWO_PI } from '../constants/orbit';
import { nearestRest } from '../lib/orbit';

/**
 * The aarti itself: the orbit the thali travels, the drag gesture that turns
 * it, Auto Aarti, and the parikrama count.
 *
 * `stage` is the measured sanctum; the orbit's geometry is derived from it.
 * `onCompleted` fires once per finished aarti.
 */
export function useAarti(stage: { w: number; h: number }, onCompleted: () => void) {
  const [circles, setCircles] = useState(0);
  const [done, setDone] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);

  // Geometry of the aarti orbit, derived from the measured sanctum.
  const cx = stage.w / 2;
  const cy = stage.h * 0.44;
  const rRest = Math.min(stage.w, stage.h) * 0.34;
  const rMin = rRest * 0.7;
  const rMax = rRest * 1.32;

  /** Total rotation carried so far — the single source of truth for progress. */
  const turned = useSharedValue(0);
  const dragAngle = useSharedValue(ANGLE_REST);
  const lastAngle = useSharedValue(ANGLE_REST);
  const radius = useSharedValue(rRest);
  const held = useSharedValue(0);
  const auto = useSharedValue(0);
  const autoBase = useSharedValue(0);
  /** Thali offset from the orbit centre at the moment the drag began. */
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  /** Drives the "grab me" pulse around the plate. */
  const pulse = useSharedValue(0);

  const progress = useDerivedValue(() => turned.value / TOTAL);
  const angle = useDerivedValue(() =>
    auto.value === 1 ? autoBase.value + turned.value : dragAngle.value,
  );

  useEffect(() => {
    radius.value = withSpring(rRest);
  }, [rRest, radius]);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }),
      -1,
      false,
    );
  }, [pulse]);

  const onCircles = useCallback(
    (n: number) => {
      setCircles(Math.min(n, AARTI_CIRCLES));
      if (n >= AARTI_CIRCLES) {
        setDone(true);
        onCompleted();
      }
    },
    [onCompleted],
  );

  useAnimatedReaction(
    () => Math.floor(turned.value / TWO_PI),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(onCircles)(cur);
    },
  );

  const finishAuto = useCallback(() => setAutoRunning(false), []);

  const runAuto = useCallback(() => {
    if (autoRunning) return;
    setAutoRunning(true);

    // Restarting after a finished aarti.
    //
    // The previous attempt wrote `turned.value = 0` and then started the
    // timing in the same tick. Reanimated commits those writes together, so
    // the animation captured TOTAL as its start value and ran its full
    // duration without moving the thali — the button looked dead. A sequence
    // snaps to the start ON THE UI THREAD before animating, which is the only
    // way to be sure the reset lands first.
    const restarting = done;
    if (restarting) {
      setCircles(0);
      setDone(false);
    }

    const from = restarting ? 0 : turned.value;
    const remaining = TOTAL - from;

    autoBase.value = dragAngle.value - from;
    lastAngle.value = dragAngle.value;
    auto.value = 1;

    turned.value = withSequence(
      withTiming(from, { duration: 0 }),
      withTiming(
        TOTAL,
        { duration: Math.max(700, (remaining / TWO_PI) * 2600), easing: Easing.linear },
        (finished) => {
          if (!finished) return;
          dragAngle.value = autoBase.value + TOTAL;
          auto.value = 0;
          dragAngle.value = withSpring(nearestRest(dragAngle.value), RETURN_SPRING);
          runOnJS(finishAuto)();
        },
      ),
    );
  }, [autoRunning, done, turned, dragAngle, lastAngle, auto, autoBase, finishAuto]);

  const resetAarti = useCallback(() => {
    auto.value = 0;
    turned.value = 0;
    dragAngle.value = withSpring(ANGLE_REST, RETURN_SPRING);
    lastAngle.value = ANGLE_REST;
    setCircles(0);
    setDone(false);
    setAutoRunning(false);
  }, [auto, turned, dragAngle, lastAngle]);

  /**
   * The thali can only be picked up by touching the thali itself, so this
   * gesture lives on the plate rather than on the sanctum.
   *
   * It works purely from the gesture's translation — the offset of the thali
   * from the orbit centre when the drag began, plus how far the finger has
   * moved. That keeps it independent of which view the gesture is attached to,
   * and it means the plate never jumps to sit under the fingertip.
   */
  const pan = Gesture.Pan()
    .hitSlop({ top: 14, bottom: 14, left: 14, right: 14 })
    .onBegin(() => {
      if (auto.value === 1) return;
      held.value = withTiming(1, { duration: 140 });
      grabX.value = Math.cos(dragAngle.value) * radius.value;
      grabY.value = Math.sin(dragAngle.value) * radius.value;
      lastAngle.value = dragAngle.value;
    })
    .onUpdate((e) => {
      if (auto.value === 1) return;
      const nx = grabX.value + e.translationX;
      const ny = grabY.value + e.translationY;
      const a = Math.atan2(ny, nx);
      let d = a - lastAngle.value;
      if (d > Math.PI) d -= TWO_PI;
      if (d < -Math.PI) d += TWO_PI;
      // Traditional aarti is clockwise, so only forward motion counts.
      if (d > 0) turned.value = Math.min(turned.value + d, TOTAL);
      lastAngle.value = a;
      dragAngle.value += d;
      radius.value = Math.min(Math.max(Math.hypot(nx, ny), rMin), rMax);
    })
    .onFinalize(() => {
      if (auto.value === 1) return;
      held.value = withTiming(0, { duration: 220 });
      // Released: glide the thali back to its resting spot below the murti.
      dragAngle.value = withSpring(nearestRest(dragAngle.value), RETURN_SPRING);
      radius.value = withSpring(rRest, RETURN_SPRING);
    });

  const thaliStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle.value) * radius.value },
      { translateY: Math.sin(angle.value) * radius.value },
      { scale: 1 + held.value * 0.1 },
    ],
  }));

  // Fades out as soon as the aarti is under way — it is only a first-run nudge.
  const grabHintStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.001 ? 0 : (1 - pulse.value) * 0.5,
    transform: [{ scale: 0.85 + pulse.value * 0.6 }],
  }));

  return {
    circles,
    done,
    autoRunning,
    progress,
    geometry: { cx, cy, rRest },
    runAuto,
    resetAarti,
    pan,
    thaliStyle,
    grabHintStyle,
  };
}
