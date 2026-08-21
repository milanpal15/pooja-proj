import { StyleSheet, View } from 'react-native';

import { MAP_H, MAP_W } from '@/constants/temples';

/**
 * A stylised relief map of India's pilgrimage geography, drawn from Views:
 * green plains, blue seas on the coasts, the Himalaya across the top, the
 * Western Ghats down the west, the Tirumala hills in the south, forests and a
 * river. Placed to roughly match where the temple markers sit.
 */

const C = {
  land: '#2B4530',
  plainA: '#33513A',
  plainB: '#3B5C41',
  sea: '#1C4257',
  seaWave: '#2E5E76',
  sand: '#8A7A4E',
  mountain: '#7A6440',
  mountainDark: '#5F4E31',
  snow: '#EEF3F6',
  hill: '#4C5E3A',
  tree: '#2C5836',
  treeLight: '#3A6E44',
  river: '#2E5E76',
} as const;

/** Triangle mountain via the border trick, with an optional snow cap. */
function Mountain({
  x,
  y,
  w,
  h,
  color = C.mountain,
  snow = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  snow?: boolean;
}) {
  return (
    <View style={{ position: 'absolute', left: x - w / 2, top: y - h }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: w / 2,
          borderRightWidth: w / 2,
          borderBottomWidth: h,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      {snow && (
        <View
          style={{
            position: 'absolute',
            left: w / 2 - w * 0.16,
            top: h * 0.18,
            width: 0,
            height: 0,
            borderLeftWidth: w * 0.16,
            borderRightWidth: w * 0.16,
            borderBottomWidth: h * 0.3,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: C.snow,
          }}
        />
      )}
    </View>
  );
}

function Tree({ x, y, s = 14 }: { x: number; y: number; s?: number }) {
  return (
    <View style={{ position: 'absolute', left: x - s / 2, top: y - s }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: s / 2,
          borderRightWidth: s / 2,
          borderBottomWidth: s,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: C.tree,
        }}
      />
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -s * 0.55,
          borderLeftWidth: s * 0.4,
          borderRightWidth: s * 0.4,
          borderBottomWidth: s * 0.8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: C.treeLight,
          alignSelf: 'center',
        }}
      />
      <View
        style={{
          width: 3,
          height: s * 0.28,
          backgroundColor: '#5A3E22',
          alignSelf: 'center',
          marginTop: -1,
        }}
      />
    </View>
  );
}

/** Deterministic pseudo-random for scattering. */
function h01(n: number) {
  const x = Math.sin(n * 57.31 + 12.9) * 43758.5453;
  return x - Math.floor(x);
}

export function MapTerrain() {
  // Mountain ranges: [x, y(base), w, h, snow]
  const himalaya = Array.from({ length: 9 }, (_, i) => {
    const x = 50 + i * 65;
    const hh = 90 + h01(i) * 60;
    return { x, y: 130, w: 90, h: hh, snow: true, color: i % 2 ? C.mountain : C.mountainDark };
  });
  const ghats = Array.from({ length: 6 }, (_, i) => {
    const y = 360 + i * 70;
    return { x: 70 + (i % 2) * 22, y, w: 74, h: 70 + h01(i + 20) * 30, snow: false, color: C.hill };
  });
  const tirumala = [
    { x: 300, y: 690, w: 84, h: 92, snow: false, color: C.mountain },
    { x: 350, y: 700, w: 96, h: 108, snow: false, color: C.mountainDark },
    { x: 392, y: 690, w: 72, h: 82, snow: false, color: C.mountain },
  ];
  const mountains = [...himalaya, ...ghats, ...tirumala];

  const trees = Array.from({ length: 26 }, (_, i) => ({
    x: 150 + h01(i) * 380,
    y: 330 + h01(i + 50) * 460,
    s: 12 + h01(i + 100) * 10,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base landmass */}
      <View style={[styles.fill, { backgroundColor: C.land }]} />

      {/* Plains patches for subtle variation */}
      {[
        { x: 120, y: 300, r: 260, c: C.plainA },
        { x: 400, y: 560, r: 280, c: C.plainB },
        { x: 260, y: 780, r: 240, c: C.plainA },
      ].map((p, i) => (
        <View
          key={`p${i}`}
          style={{
            position: 'absolute',
            left: p.x - p.r / 2,
            top: p.y - p.r / 2,
            width: p.r,
            height: p.r,
            borderRadius: p.r / 2,
            backgroundColor: p.c,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Seas on the coasts: Arabian (west/left), Bay of Bengal (east/right),
          Indian Ocean (south/bottom). */}
      <View style={[styles.seaLeft]} />
      <View style={[styles.seaRight]} />
      <View style={[styles.seaBottom]} />
      {/* Wave dashes near the coasts */}
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={`wl${i}`} style={[styles.wave, { left: 34, top: 120 + i * 60 }]} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`wr${i}`} style={[styles.wave, { right: 34, top: 300 + i * 55 }]} />
      ))}

      {/* Thar-desert sandy patch, top-left */}
      <View style={styles.desert} />

      {/* River Ganga — a winding band from the northern mountains past Kashi. */}
      {Array.from({ length: 14 }).map((_, i) => {
        const t = i / 13;
        const x = 250 + Math.sin(t * Math.PI * 1.6) * 70 + t * 150;
        const y = 170 + t * 230;
        return (
          <View
            key={`riv${i}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 16,
              height: 26,
              borderRadius: 8,
              backgroundColor: C.river,
              opacity: 0.85,
            }}
          />
        );
      })}

      {/* Forests */}
      {trees.map((t, i) => (
        <Tree key={`t${i}`} x={t.x} y={t.y} s={t.s} />
      ))}

      {/* Mountains last so they sit above plains/forests */}
      {mountains.map((m, i) => (
        <Mountain key={`m${i}`} x={m.x} y={m.y} w={m.w} h={m.h} color={m.color} snow={m.snow} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: MAP_W, height: MAP_H, borderRadius: 28 },
  seaLeft: {
    position: 'absolute',
    left: 0,
    top: 300,
    width: 42,
    height: 380,
    backgroundColor: C.sea,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
  },
  seaRight: {
    position: 'absolute',
    right: 0,
    top: 260,
    width: 46,
    height: 360,
    backgroundColor: C.sea,
    borderTopLeftRadius: 30,
    borderBottomLeftRadius: 30,
  },
  seaBottom: {
    position: 'absolute',
    left: 120,
    bottom: 0,
    width: 380,
    height: 60,
    backgroundColor: C.sea,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  wave: {
    position: 'absolute',
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.seaWave,
    opacity: 0.7,
  },
  desert: {
    position: 'absolute',
    left: 60,
    top: 210,
    width: 150,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.sand,
    opacity: 0.35,
  },
});
