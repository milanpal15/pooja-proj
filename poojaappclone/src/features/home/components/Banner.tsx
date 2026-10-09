import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { toneFor } from '../lib/tones';

/**
 * Artwork (or a toned gradient when there is none) with a dark scrim and room
 * for overlay children. The Image is laid out NORMALLY inside the rounded,
 * clipped box — absolutely positioning it under overflow:hidden + a radius
 * draws nothing on Android (see ArchImage). `seed` keeps a card's colour stable.
 */
export function Banner({
  uri,
  seed,
  scrim = 'bottom',
  style,
  children,
}: {
  uri?: string;
  seed: string;
  /** Where the darkening sits so overlaid text stays readable. */
  scrim?: 'bottom' | 'left';
  style: ViewStyle;
  children?: React.ReactNode;
}) {
  const { scheme } = useTheme();
  const [from, to] = toneFor(seed, scheme === 'dark');
  const left = scrim === 'left';

  return (
    <View style={[styles.box, { backgroundColor: from }, style]}>
      {uri ? (
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
      )}
      <LinearGradient
        colors={left ? ['rgba(30,10,5,0.82)', 'rgba(30,10,5,0.15)'] : ['rgba(0,0,0,0.05)', 'rgba(30,10,5,0.78)']}
        start={left ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={left ? { x: 0.75, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
});
