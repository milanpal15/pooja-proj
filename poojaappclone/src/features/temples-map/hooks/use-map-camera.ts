import { useCallback } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { MAP_H, MAP_W } from '@/constants/temples';

import { FOCUS_SCALE, MAX_SCALE, SPRING } from '../constants/camera';

/**
 * The camera over the map canvas: one shared transform, not per-marker
 * motion. Drag to pan, pinch to zoom, both clamped so the map edges never
 * move inside the viewport.
 */
export function useMapCamera() {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  // Viewport size, measured on layout — needed to clamp the camera to the map.
  const viewW = useSharedValue(0);
  const viewH = useSharedValue(0);

  // Smallest scale that still fills the viewport, so zooming out never reveals
  // empty space beyond the map edges ("cover" fit).
  const minScale = useCallback(() => {
    'worklet';
    if (!viewW.value || !viewH.value) return 1;
    return Math.max(viewW.value / MAP_W, viewH.value / MAP_H);
  }, [viewW, viewH]);

  // Clamp translation so the map edges never move inside the viewport.
  const clampCamera = useCallback(() => {
    'worklet';
    const maxX = Math.max(0, (MAP_W * scale.value - viewW.value) / 2);
    const maxY = Math.max(0, (MAP_H * scale.value - viewH.value) / 2);
    tx.value = Math.min(Math.max(tx.value, -maxX), maxX);
    ty.value = Math.min(Math.max(ty.value, -maxY), maxY);
  }, [scale, tx, ty, viewW, viewH]);

  const onViewport = useCallback(
    (w: number, h: number) => {
      viewW.value = w;
      viewH.value = h;
      // Start at the cover scale, centred.
      const ms = Math.max(w / MAP_W, h / MAP_H);
      if (scale.value < ms) scale.value = ms;
      clampCamera();
    },
    [viewW, viewH, scale, clampCamera],
  );

  const pan = Gesture.Pan()
    // Require real movement so taps still reach the markers underneath.
    .minDistance(8)
    .onBegin(() => {
      startX.value = tx.value;
      startY.value = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startX.value + e.translationX;
      ty.value = startY.value + e.translationY;
      clampCamera();
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      startScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(startScale.value * e.scale, minScale()), MAX_SCALE);
      clampCamera();
    });

  const camera = Gesture.Simultaneous(pan, pinch);

  /** Bring a map point toward the centre, zoomed in, but never past the map edges. */
  const flyTo = useCallback(
    (point: { x: number; y: number }) => {
      const s = Math.max(FOCUS_SCALE, minScale());
      const maxX = Math.max(0, (MAP_W * s - viewW.value) / 2);
      const maxY = Math.max(0, (MAP_H * s - viewH.value) / 2);
      const clamp = (v: number, m: number) => Math.min(Math.max(v, -m), m);
      scale.value = withSpring(s, SPRING);
      // Bring the marker toward centre, but never past the map edges.
      tx.value = withSpring(clamp(-(point.x - MAP_W / 2) * s, maxX), SPRING);
      ty.value = withSpring(clamp(-(point.y - MAP_H / 2) * s, maxY), SPRING);
    },
    [scale, tx, ty, viewW, viewH, minScale],
  );

  const resetCamera = useCallback(() => {
    scale.value = withSpring(minScale(), SPRING);
    tx.value = withSpring(0, SPRING);
    ty.value = withSpring(0, SPRING);
  }, [scale, tx, ty, minScale]);

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return { camera, cameraStyle, onViewport, flyTo, resetCamera };
}
