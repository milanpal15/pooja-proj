import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { type Deity } from '@/constants/deities';
import { useContent } from '@/providers/content';

/**
 * Which murti the sanctum shows: the strip's selection, the vertical-swipe
 * cycling, and the Temples tab's "Perform Pooja" deep link. `reset` restarts
 * the aarti whenever the deity changes.
 */
export function useDeitySelection(reset: () => void) {
  const { deityById, deityList } = useContent();

  // A deity id passed from the Temples tab ("Perform Pooja") preselects the murti.
  // `ts` is a per-navigation nonce so the same deity still restarts the aarti.
  const { deity: deityParam, ts } = useLocalSearchParams<{ deity?: string; ts?: string }>();
  const [deity, setDeity] = useState<Deity | undefined>(() => deityById(deityParam));

  /** Drives the cross-fade when the selected deity changes. */
  const swap = useSharedValue(1);
  /** Direction of the last deity change (+1 swipe up / next, -1 down / prev). */
  const swapDir = useSharedValue(0);

  // Swap animation whenever the strip selection changes.
  useEffect(() => {
    swap.value = 0;
    swap.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [deity?.id, swap]);

  const selectDeity = useCallback(
    (d: Deity) => {
      setDeity(d);
      reset();
    },
    [reset],
  );

  // Vertical swipe cycles the deity: flick up = next, flick down = previous.
  const changeDeity = useCallback(
    (dir: 1 | -1) => {
      if (!deityList.length) return;
      const i = deityList.findIndex((d) => d.id === deity?.id);
      const next = deityList[(i + dir + deityList.length) % deityList.length];
      swapDir.value = dir;
      selectDeity(next);
    },
    [deity?.id, deityList, selectDeity, swapDir],
  );

  // Vertical drag past a threshold changes the deity — more forgiving than a
  // fling (fires on a slow swipe too). Only activates on vertical motion, and
  // fails on horizontal so it never fights the strip or a stray tap.
  const deitySwipe = Gesture.Pan()
    .activeOffsetY([-16, 16])
    .failOffsetX([-28, 28])
    .onEnd((e) => {
      if (e.translationY <= -40 || e.velocityY < -600) runOnJS(changeDeity)(1);
      else if (e.translationY >= 40 || e.velocityY > 600) runOnJS(changeDeity)(-1);
    });

  // Re-select when arriving from Temples with a new deity param (this tab stays
  // mounted, so the initial useState value won't pick up later navigations).
  useEffect(() => {
    // Reacting to a route-param change is a legitimate effect-driven update.
    // `ts` in the deps makes every "Perform Pooja" restart, even for same deity.
    const next = deityById(deityParam);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (deityParam && next) selectDeity(next);
  }, [deityParam, ts, selectDeity, deityById]);

  const idolStyle = useAnimatedStyle(() => ({
    opacity: swap.value,
    transform: [
      { scale: 0.9 + swap.value * 0.1 },
      // New murti slides in from the swipe direction as it fades in.
      { translateY: (1 - swap.value) * swapDir.value * 50 },
    ],
  }));

  return { deity, selectDeity, deitySwipe, idolStyle };
}
