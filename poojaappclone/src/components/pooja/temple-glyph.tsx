import { StyleSheet, View } from 'react-native';

import { Glow } from '@/components/pooja/flame';
import { mixHex } from '@/constants/color';
import type { Temple } from '@/constants/temples';

/**
 * A stylised gopuram built from stacked tiers. Purely presentational — no art
 * assets, and it re-colours from the temple palette.
 */
export function TempleGlyph({ temple, size = 180 }: { temple: Temple; size?: number }) {
  const unit = size / 180;
  const tiers = 5;

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Glow size={size * 1.5} color={temple.accent} rings={4} intensity={0.7} />

      <View style={styles.stack}>
        {/* Kalash finial */}
        <View style={[styles.finial, { backgroundColor: temple.accent, height: 14 * unit }]} />
        <View
          style={[
            styles.kalash,
            {
              backgroundColor: temple.accent,
              width: 14 * unit,
              height: 14 * unit,
              borderRadius: 7 * unit,
            },
          ]}
        />

        {/* Stepped tower tiers, widening toward the base */}
        {Array.from({ length: tiers }).map((_, i) => {
          const t = i / (tiers - 1);
          const w = (46 + t * 74) * unit;
          return (
            <View key={i} style={styles.tierGroup}>
              <View
                style={{
                  width: w,
                  height: 15 * unit,
                  backgroundColor: mixHex(temple.idol, temple.trim, t * 0.5),
                }}
              />
              {/* Cornice band between tiers */}
              <View
                style={{
                  width: w + 8 * unit,
                  height: 4 * unit,
                  backgroundColor: temple.trim,
                  opacity: 0.9,
                }}
              />
            </View>
          );
        })}

        {/* Sanctum wall with an arched doorway */}
        <View
          style={[
            styles.sanctum,
            { width: 128 * unit, height: 42 * unit, backgroundColor: temple.idol },
          ]}>
          <View
            style={[
              styles.door,
              {
                width: 26 * unit,
                height: 34 * unit,
                borderTopLeftRadius: 13 * unit,
                borderTopRightRadius: 13 * unit,
                backgroundColor: mixHex('#000000', temple.accent, 0.25),
              },
            ]}
          />
        </View>

        {/* Plinth */}
        <View
          style={{
            width: 148 * unit,
            height: 8 * unit,
            backgroundColor: temple.trim,
            borderRadius: 2 * unit,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  stack: { position: 'absolute', alignItems: 'center' },
  finial: { width: 3, borderRadius: 2 },
  kalash: { marginTop: -2 },
  tierGroup: { alignItems: 'center' },
  sanctum: { alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  door: {},
});
