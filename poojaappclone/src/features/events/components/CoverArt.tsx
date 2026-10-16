import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { assetUrl } from '@/providers/content';

/**
 * An event's picture: the theme gradient with the uploaded cover over it, and an optional dim so text
 * on top stays legible. Layers are siblings with their own radius (never a clipped parent), so Android
 * draws them — see AGENTS.md §5 on `overflow:'hidden'` + large radius.
 */
export function CoverArt({
  gradient,
  cover,
  radius = 0,
  topRadius,
  dim = false,
  style,
  children,
}: {
  gradient: [string, string];
  cover?: string;
  radius?: number;
  /** Round only the top corners (a card's cover). */
  topRadius?: number;
  dim?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const uri = assetUrl(cover || undefined);
  const corners = topRadius !== undefined ? { borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius } : { borderRadius: radius };
  return (
    <View style={[corners, style]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.layer, corners]} />
      {!!uri && <Image source={{ uri }} resizeMode="cover" style={[styles.layer, corners]} />}
      {dim && <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={[styles.layer, corners]} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
