import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';

import { Mandala, Type } from '@/components/ui';
import type { Deity } from '@/constants/deities';
import { Fill, Radius, Space } from '@/theme';

import { WASHES } from '../constants/washes';

/**
 * The captured view. Everything inside it lands in the saved image,
 * so nothing app-chrome may appear here.
 */
export function WallpaperCanvas({
  shotRef,
  style,
  art,
  deity,
}: {
  shotRef: React.RefObject<View | null>;
  style: string;
  art: ImageSourcePropType | undefined;
  deity: Deity | undefined;
}) {
  return (
    <View style={styles.previewWrap}>
      <View ref={shotRef} collapsable={false} style={styles.canvas}>
        <LinearGradient
          colors={WASHES[style] ?? WASHES.sanctum}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[Fill, { pointerEvents: 'none' }]}
        />
        <Mandala size={420} opacity={0.13} petals={20} style={styles.canvasMandala} />

        {art && <Image source={art} resizeMode="contain" style={styles.canvasArt} />}

        <View style={styles.canvasText}>
          <Type v="headlineLg" color="#FFF6E6" center numberOfLines={1}>
            {deity?.name}
          </Type>
          <Type v="mantra" color="rgba(255,246,230,0.86)" center numberOfLines={2}>
            {deity?.mantra}
          </Type>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: 'center' },
  canvas: {
    width: 260,
    // Roughly a modern phone's aspect, so the preview is honest about crop.
    height: 260 * (19.5 / 9),
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  canvasMandala: { position: 'absolute', top: '14%', alignSelf: 'center' },
  canvasArt: { position: 'absolute', top: '26%', width: 210, height: 260 },
  canvasText: { paddingHorizontal: Space.md, paddingBottom: 56, gap: 6 },
});
