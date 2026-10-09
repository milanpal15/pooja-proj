import { Image, type ImageSourcePropType, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius } from '@/theme';

/**
 * Featured media under a temple arch (DESIGN.md "Temple Arch": large top radius, small bottom radius). `height` is required so the arch radius
 * can be derived from it — an arch that doesn't scale with its image reads as
 * a rounding mistake rather than architecture.
 */
export function ArchImage({
  source,
  height,
  style,
  children,
  /**
   * `cover` for photographs; `contain` for the transparent deity cutouts,
   * which crop to an empty region under `cover` and render as a blank box.
   */
  fit = 'cover',
}: {
  /**
   * Optional: artwork comes from the dashboard, and a deity may not have
   * any yet. The arch, its backdrop and any children still render — an
   * empty frame is the honest answer, and better than a crash.
   */
  source?: ImageSourcePropType;
  height: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  fit?: 'cover' | 'contain';
}) {
  const arch = Math.min(Radius.arch, height * 0.42);
  return (
    <View
      style={[
        {
          height,
          borderTopLeftRadius: arch,
          borderTopRightRadius: arch,
          borderBottomLeftRadius: Radius.md,
          borderBottomRightRadius: Radius.md,
          overflow: 'hidden',
        },
        style,
      ]}>
      {/*
        Sized with width/height rather than an absolute Fill. On Android an
        absolutely-positioned child of a view that combines `overflow:'hidden'`
        with a large corner radius gets clipped away entirely — the arch drew
        its background and the label, and the deity never appeared. A
        normally-laid-out child is clipped correctly.
      */}
      {source && <Image source={source} resizeMode={fit} style={styles.archImage} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  archImage: { width: '100%', height: '100%' },
});
