import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Clouds } from '@/components/mandir/clouds';
import { MapTerrain } from '@/components/mandir/map-terrain';
import { Glow } from '@/components/pooja/flame';
import { TempleGlyph } from '@/components/pooja/temple-glyph';
import { mixHex } from '@/constants/color';
import { MAP_H, MAP_W, type Temple } from '@/constants/temples';
import { BottomTabInset } from '@/constants/theme';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';

const SPRING = { damping: 20, stiffness: 120, mass: 0.9 } as const;
const MAX_SCALE = 2.4;
const FOCUS_SCALE = 1.4;

export default function TemplesScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  // Temples now carry their deity's slug; the display name comes from the
  // dashboard so an admin-added deity reads correctly here too.
  const { deityName, templeList } = useContent();
  const [selected, setSelected] = useState<Temple | null>(null);

  // Camera over the map canvas: one shared transform, not per-marker motion.
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

  const focusOn = useCallback(
    (t: Temple) => {
      setSelected(t);
      const s = Math.max(FOCUS_SCALE, minScale());
      const maxX = Math.max(0, (MAP_W * s - viewW.value) / 2);
      const maxY = Math.max(0, (MAP_H * s - viewH.value) / 2);
      const clamp = (v: number, m: number) => Math.min(Math.max(v, -m), m);
      scale.value = withSpring(s, SPRING);
      // Bring the marker toward centre, but never past the map edges.
      tx.value = withSpring(clamp(-(t.map.x - MAP_W / 2) * s, maxX), SPRING);
      ty.value = withSpring(clamp(-(t.map.y - MAP_H / 2) * s, maxY), SPRING);
    },
    [scale, tx, ty, viewW, viewH, minScale],
  );

  const resetView = useCallback(() => {
    setSelected(null);
    scale.value = withSpring(minScale(), SPRING);
    tx.value = withSpring(0, SPRING);
    ty.value = withSpring(0, SPRING);
  }, [scale, tx, ty, minScale]);

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const theme = selected ?? templeList[0];

  return (
    <View style={[styles.root, { backgroundColor: theme.backdrop[1] }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('pilgrimage_map')}</Text>
          <Text style={styles.title}>{selected ? selected.name : t('choose_temple')}</Text>
          <Text style={[styles.location, { color: theme.trim }]}>
            {selected ? selected.location : `${templeList.length} ${t('tap_marker')}`}
          </Text>
        </View>

        {/* Map viewport — drag to pan, pinch to zoom. */}
        <View
          style={styles.viewport}
          onLayout={(e) => onViewport(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
          <GestureDetector gesture={camera}>
            <View style={styles.viewportInner}>
              <Animated.View style={[styles.canvas, cameraStyle]}>
                <MapTerrain />
                <Routes temples={templeList} />
                {/* Clouds of varying density drift all across the map, above the
                    terrain but below the markers so pins stay visible/tappable. */}
                <Clouds width={MAP_W} height={MAP_H} count={11} />
                {templeList.map((t) => (
                  <Marker
                    key={t.id}
                    temple={t}
                    selected={selected?.id === t.id}
                    onPress={() => focusOn(t)}
                  />
                ))}
              </Animated.View>
            </View>
          </GestureDetector>

          <View style={styles.recenterRow} pointerEvents="box-none">
            <Pressable onPress={resetView} style={[styles.recenter, { borderColor: theme.trim }]}>
              <Text style={[styles.recenterText, { color: theme.trim }]}>{t('reset_view')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Detail card for the selected temple */}
        <View style={[styles.sheet, { paddingBottom: BottomTabInset + 24 }]}>
          {selected ? (
            <View style={[styles.card, { borderColor: selected.trim }]}>
              <View style={styles.cardRow}>
                <TempleGlyph temple={selected} size={78} />
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{selected.name}</Text>
                  <Text style={[styles.cardDeity, { color: selected.accent }]}>
                    {deityName(selected.deity)}
                  </Text>
                  <Text style={styles.cardAarti}>{selected.aarti}</Text>
                  <View style={styles.chips}>
                    {selected.offerings.slice(0, 2).map((o) => (
                      <View key={o} style={[styles.chip, { borderColor: selected.trim }]}>
                        <Text style={[styles.chipText, { color: selected.trim }]}>{o}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/pooja',
                    // `ts` is a nonce so re-selecting the same deity still restarts
                    // the aarti (identical params would otherwise skip the reset).
                    params: { deity: selected.deity, ts: String(Date.now()) },
                  })
                }
                style={[styles.cta, { backgroundColor: selected.accent }]}>
                <Text style={styles.ctaText}>{t('perform_pooja')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.placeholder}>{t('tap_to_begin')}</Text>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Dotted pilgrimage routes linking the temples in order. */
function Routes({ temples }: { temples: Temple[] }) {
  const dots: { x: number; y: number; key: string }[] = [];
  for (let i = 0; i < temples.length - 1; i++) {
    const a = temples[i].map;
    const b = temples[i + 1].map;
    const steps = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 22);
    for (let s = 1; s < steps; s++) {
      dots.push({
        x: a.x + ((b.x - a.x) * s) / steps,
        y: a.y + ((b.y - a.y) * s) / steps,
        key: `${i}-${s}`,
      });
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d) => (
        <View key={d.key} style={[styles.routeDot, { left: d.x - 2, top: d.y - 2 }]} />
      ))}
    </View>
  );
}

function Marker({
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
  root: { flex: 1, overflow: 'hidden' },
  safe: { flex: 1, overflow: 'hidden' },
  header: { alignItems: 'center', gap: 3, paddingTop: 6, paddingHorizontal: 24 },
  eyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#fff', fontSize: 23, fontWeight: '700', textAlign: 'center' },
  location: { fontSize: 13, fontWeight: '500' },
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
  routeDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
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
  sheet: { paddingHorizontal: 16, paddingTop: 10 },
  placeholder: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 26,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardDeity: { fontSize: 12, fontWeight: '600' },
  cardAarti: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 5 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '600' },
  cta: { paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  ctaText: { color: '#1A1000', fontWeight: '700', fontSize: 15 },
});
