import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { type GestureType, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type AnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { DeityIdol } from '@/components/illustrations/deity-idol';
import { MarigoldRain } from '@/components/illustrations/marigold';
import { TempleBackdrop } from '@/components/illustrations/temple-scene';
import type { Deity } from '@/constants/deities';

/**
 * The scenery layer — backdrop, falling marigolds, murti and panchang banner.
 * It also catches vertical swipes to change the deity.
 */
export function SanctumScene({
  stage,
  deity,
  progress,
  geometry,
  swipe,
  flowersFalling,
  idolStyle,
  panchangLine,
}: {
  stage: { w: number; h: number };
  deity: Deity;
  progress: SharedValue<number>;
  geometry: { cx: number; cy: number; rRest: number };
  swipe: GestureType;
  flowersFalling: boolean;
  idolStyle: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  panchangLine: string;
}) {
  const { cy, rRest } = geometry;
  return (
    <>
      <TempleBackdrop width={stage.w} height={stage.h} accent={deity.accent} />

      {/* Scenery layer — also catches vertical swipes to change the deity.
          `box-only` makes it receive the swipe while its children stay inert;
          the thali/rail/bells are siblings on top and keep their own touches. */}
      <GestureDetector gesture={swipe}>
        <View style={styles.stageFill} pointerEvents="box-only">
          {flowersFalling && <MarigoldRain width={stage.w} height={stage.h} count={16} />}

          {/* Murti, centred on the aarti orbit */}
          <Animated.View
            style={[
              styles.idolWrap,
              { top: cy - stage.h * 0.3, height: stage.h * 0.62 },
              idolStyle,
            ]}
          >
            <DeityIdol deity={deity} progress={progress} size={Math.min(stage.w * 0.72, 290)} />
          </Animated.View>

          {/* Panchang banner */}
          <View style={[styles.banner, { top: cy + rRest * 0.52 }]}>
            <Text style={styles.bannerText}>{panchangLine}</Text>
          </View>
        </View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  stageFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  idolWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },

  banner: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#FFE063',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 5,
    zIndex: 3,
  },
  bannerText: { color: '#6B3B00', fontWeight: '700', fontSize: 13 },
});
