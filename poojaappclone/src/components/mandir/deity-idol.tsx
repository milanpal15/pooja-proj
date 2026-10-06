import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Glow } from '@/components/pooja/flame';
import { useContent } from '@/context/content';
import type { Deity } from '@/constants/deities';

/**
 * A stylised murti assembled from plain Views. Each deity is distinguished by
 * crown, colouring and attributes (crescent, serpent, trunk, mace) rather than
 * by bitmap art, so new deities need no assets.
 *
 * `progress` (0..1) brightens the halo as the aarti advances.
 */
export function DeityIdol({
  deity,
  progress,
  size = 300,
}: {
  deity: Deity;
  progress: SharedValue<number>;
  size?: number;
}) {
  const breathe = useSharedValue(0);

  useEffect(() => {
    breathe.value = withRepeat(withTiming(1, { duration: 2800 }), -1, true);
  }, [breathe]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.4, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.92, 1.1]) }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.value * 0.01 }],
  }));

  // Admin-managed artwork, else draw the procedural murti. There used to be
  // a third source — a map of oleographs compiled into the app — which meant
  // a deity's picture could disagree with the dashboard and only a store
  // release could settle it.
  const remote = useContent().deityImage(deity.id);
  const artwork = remote ?? deity.image;

  return (
    <View style={[styles.root, { width: size, height: size * 1.05 }]} pointerEvents="none">
      <Animated.View style={[styles.halo, haloStyle]}>
        <Glow size={size * 0.95} color={deity.accent} rings={5} />
      </Animated.View>

      {/* Real artwork wins when supplied; the procedural murti is the fallback. */}
      {artwork ? (
        <Animated.Image
          source={artwork}
          resizeMode="contain"
          style={[{ width: size, height: size * 1.02 }, bodyStyle]}
        />
      ) : (
        <Animated.View style={[styles.figure, bodyStyle]}>
          {/* Cobra hood rising behind the shoulder */}
          {deity.serpent && (
            <View style={styles.serpent}>
              <View style={styles.serpentHood} />
              <View style={styles.serpentBody} />
            </View>
          )}

          <Crown deity={deity} />

          {/* Head — elephant for Ganesha, otherwise a plain murti head */}
          {deity.elephant ? (
            <View style={styles.elephantHead}>
              <View style={[styles.ear, styles.earLeft, { backgroundColor: deity.body }]} />
              <View style={[styles.ear, styles.earRight, { backgroundColor: deity.body }]} />
              <View style={[styles.head, { backgroundColor: deity.body }]}>
                <View style={[styles.tilak, { backgroundColor: deity.trim }]} />
              </View>
              <View style={[styles.trunk, { backgroundColor: deity.body }]} />
              <View style={[styles.tusk, { left: 28 }]} />
              <View style={[styles.tusk, { right: 28 }]} />
            </View>
          ) : (
            <View style={[styles.head, { backgroundColor: deity.body }]}>
              <View style={[styles.tilak, { backgroundColor: deity.trim }]} />
              <View style={styles.eyes}>
                <View style={styles.eye} />
                <View style={styles.eye} />
              </View>
            </View>
          )}

          {/* Shoulders and torso */}
          <View style={[styles.torso, { backgroundColor: deity.body }]} />

          {/* Robe / dhoti draped below the waist */}
          <View style={[styles.robe, { backgroundColor: deity.robe }]}>
            <View style={[styles.robeFold, { backgroundColor: deity.trim }]} />
          </View>

          {/* Garland of flowers across the chest */}
          <View style={styles.garland}>
            {Array.from({ length: 11 }).map((_, i) => {
              const t = (i - 5) / 5;
              return (
                <View
                  key={i}
                  style={[
                    styles.bead,
                    {
                      backgroundColor: i % 2 ? deity.trim : deity.accent,
                      transform: [{ translateY: Math.abs(t) * 30 }],
                    },
                  ]}
                />
              );
            })}
          </View>

          {/* Gada resting beside Hanuman */}
          {deity.mace && (
            <View style={styles.mace}>
              <View style={[styles.maceHead, { backgroundColor: deity.trim }]} />
              <View style={[styles.maceShaft, { backgroundColor: deity.trim }]} />
            </View>
          )}

          {/* Lotus pedestal */}
          <View style={styles.lotus}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.petal,
                  {
                    backgroundColor: deity.trim,
                    opacity: 0.55 + (i % 2) * 0.4,
                    transform: [{ rotate: `${(i - 4) * 11}deg` }],
                  },
                ]}
              />
            ))}
          </View>
        </Animated.View>
      )}

      <Text style={[styles.mark, { color: deity.accent }]}>{deity.mark}</Text>
    </View>
  );
}

function Crown({ deity }: { deity: Deity }) {
  if (deity.crown === 'jata') {
    // Matted hair knot with a crescent moon tucked into it.
    return (
      <View style={styles.crownWrap}>
        <View style={[styles.jata, { backgroundColor: deity.body }]} />
        <View style={[styles.jataKnot, { backgroundColor: deity.body }]} />
        {deity.crescent && <View style={styles.crescent} />}
      </View>
    );
  }

  if (deity.crown === 'plain') {
    return (
      <View style={styles.crownWrap}>
        <View style={[styles.band, { backgroundColor: deity.trim }]} />
      </View>
    );
  }

  const tall = deity.crown === 'tall';
  return (
    <View style={styles.crownWrap}>
      <View
        style={[
          styles.mukut,
          {
            borderBottomColor: deity.trim,
            borderBottomWidth: tall ? 40 : 30,
            borderLeftWidth: tall ? 20 : 24,
            borderRightWidth: tall ? 20 : 24,
          },
        ]}
      />
      <View style={[styles.crownJewel, { backgroundColor: deity.accent }]} />
      <View style={[styles.band, { backgroundColor: deity.trim }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-end' },
  halo: {
    position: 'absolute',
    top: '8%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  figure: { alignItems: 'center' },

  // Cobra rising behind the right shoulder: hood on top, body dropping below.
  serpent: {
    position: 'absolute',
    top: 44,
    right: 16,
    alignItems: 'center',
    zIndex: 0,
  },
  serpentHood: {
    width: 28,
    height: 22,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: '#7C8B6A',
  },
  serpentBody: {
    width: 11,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#7C8B6A',
    marginTop: -2,
  },

  crownWrap: { alignItems: 'center', zIndex: 2 },
  jata: {
    width: 46,
    height: 26,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  jataKnot: {
    width: 26,
    height: 22,
    borderRadius: 12,
    marginTop: -34,
    marginBottom: 12,
  },
  crescent: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFF6D8',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '35deg' }],
  },
  mukut: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  crownJewel: { width: 10, height: 10, borderRadius: 5, marginTop: -20 },
  band: { width: 56, height: 8, borderRadius: 4, marginTop: 8 },

  head: {
    width: 58,
    height: 64,
    borderRadius: 29,
    marginTop: -2,
    alignItems: 'center',
    paddingTop: 14,
    zIndex: 1,
  },
  tilak: { width: 5, height: 17, borderRadius: 3 },
  eyes: { flexDirection: 'row', gap: 16, marginTop: 6 },
  eye: {
    width: 9,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(40,20,0,0.55)',
  },

  elephantHead: { alignItems: 'center', justifyContent: 'center' },
  ear: {
    position: 'absolute',
    width: 38,
    height: 46,
    borderRadius: 20,
    top: 6,
  },
  earLeft: { left: -26 },
  earRight: { right: -26 },
  trunk: { width: 16, height: 40, borderRadius: 9, marginTop: -8 },
  tusk: {
    position: 'absolute',
    bottom: -2,
    width: 8,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#FFF6E0',
  },

  torso: {
    width: 116,
    height: 84,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    marginTop: -8,
  },
  robe: {
    width: 150,
    height: 62,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginTop: -6,
    alignItems: 'center',
    overflow: 'hidden',
  },
  robeFold: { width: 10, height: 62, opacity: 0.5 },
  garland: {
    position: 'absolute',
    top: 126,
    flexDirection: 'row',
    gap: 5,
    zIndex: 3,
  },
  bead: { width: 8, height: 8, borderRadius: 4 },

  mace: { position: 'absolute', right: -26, bottom: 46, alignItems: 'center' },
  maceHead: { width: 22, height: 24, borderRadius: 8 },
  maceShaft: { width: 7, height: 46, borderRadius: 4, opacity: 0.9 },

  lotus: { flexDirection: 'row', marginTop: -10, gap: 0 },
  petal: { width: 16, height: 21, borderRadius: 9, marginHorizontal: -1 },

  mark: {
    position: 'absolute',
    top: 0,
    fontSize: 24,
    fontWeight: '700',
    opacity: 0.92,
  },
});
