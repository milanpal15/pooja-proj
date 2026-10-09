import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type ComposedGesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

import { Clouds } from '@/components/illustrations/clouds';
import { MapTerrain } from '@/components/illustrations/map-terrain';
import { MAP_H, MAP_W, type Temple } from '@/constants/temples';

import { Marker } from './Marker';
import { Routes } from './Routes';

/** Map viewport — drag to pan, pinch to zoom. */
export function MapViewport({
  temples,
  selectedId,
  camera,
  cameraStyle,
  trim,
  resetLabel,
  onLayoutSize,
  onSelect,
  onReset,
}: {
  temples: Temple[];
  selectedId: string | undefined;
  camera: ComposedGesture;
  cameraStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  trim: string;
  resetLabel: string;
  onLayoutSize: (w: number, h: number) => void;
  onSelect: (t: Temple) => void;
  onReset: () => void;
}) {
  return (
    <View
      style={styles.viewport}
      onLayout={(e) => onLayoutSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
      <GestureDetector gesture={camera}>
        <View style={styles.viewportInner}>
          <Animated.View style={[styles.canvas, cameraStyle]}>
            <MapTerrain />
            <Routes temples={temples} />
            {/* Clouds of varying density drift all across the map, above the
                terrain but below the markers so pins stay visible/tappable. */}
            <Clouds width={MAP_W} height={MAP_H} count={11} />
            {temples.map((t) => (
              <Marker
                key={t.id}
                temple={t}
                selected={selectedId === t.id}
                onPress={() => onSelect(t)}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.recenterRow} pointerEvents="box-none">
        <Pressable onPress={onReset} style={[styles.recenter, { borderColor: trim }]}>
          <Text style={[styles.recenterText, { color: trim }]}>{resetLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', marginTop: 10, alignSelf: 'stretch' },
  viewportInner: { flex: 1, overflow: 'hidden' },
  // Absolutely positioned and centred by margin, so the oversized canvas never
  // participates in layout and widens the page.
  canvas: {
    position: 'absolute',
    width: MAP_W,
    height: MAP_H,
    left: '50%',
    top: '50%',
    marginLeft: -MAP_W / 2,
    marginTop: -MAP_H / 2,
  },
  recenterRow: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'flex-end',
    paddingRight: 14,
  },
  recenter: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  recenterText: { fontSize: 12, fontWeight: '600' },
});
