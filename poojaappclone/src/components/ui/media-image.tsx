/**
 * `MediaImage` — a dashboard-uploaded picture; with none it shows a kumkum-to-saffron gradient, never a blank block.
 *
 * The image is laid out normally and rounded itself; the parent does NOT use
 * `overflow:'hidden'` with the radius, because Android then clips absolutely
 * positioned content (AGENTS.md §5, the ArchImage bug). Children overlay it.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'react-native';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { assetUrl } from '@/providers/content';
import { Kumkum, Saffron, useTheme } from '@/theme';

import { Type } from './type';

export function MediaImage({
  uri,
  height,
  width,
  radius = 0,
  label,
  colors,
  style,
  children,
}: {
  /** Host-relative `/uploads/..` or absolute; undefined/empty shows the fallback. */
  uri?: string | null;
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  /** Shown over the gradient when there is no picture, so a banner is never an anonymous colour block. */
  label?: string;
  /** Fallback gradient stops (default kumkum to saffron). */
  colors?: readonly [string, string, string];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const src = assetUrl(uri ?? undefined);
  return (
    <View style={[{ height, width: width ?? '100%', borderRadius: radius, backgroundColor: c.accentContainer }, style]}>
      {!src && (
        <LinearGradient
          colors={(colors ?? [Kumkum[800], Kumkum[500], Saffron[400]]) as unknown as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: '100%', height: '100%', borderRadius: radius, justifyContent: 'flex-end', padding: 16 }}>
          {!!label && (
            <Type v="titleLg" color="#FFFFFF" numberOfLines={3}>
              {label}
            </Type>
          )}
        </LinearGradient>
      )}
      {!!src && (
        <Image
          source={{ uri: src }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%', borderRadius: radius }}
        />
      )}
      {!!children && <View style={[StyleSheet.absoluteFill, { borderRadius: radius }]}>{children}</View>}
    </View>
  );
}
