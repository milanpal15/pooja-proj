/**
 * `MediaBanner` — a card banner with the design's overlay: a dark scrim, an
 * outlined tag chip top-left and the title in white at the bottom. With no
 * picture it falls back to `MediaImage`'s toned gradient, never a blank block.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { MediaImage } from './media-image';
import { Type } from './type';

export function MediaBanner({
  uri,
  title,
  tag,
  height = 190,
  titleSize = 20,
  radius = 0,
  children,
}: {
  uri?: string | null;
  title: string;
  tag?: string;
  height?: number;
  titleSize?: number;
  radius?: number;
  /** Extra overlay, e.g. a "Closing soon" badge, placed top-right. */
  children?: React.ReactNode;
}) {
  return (
    <MediaImage uri={uri} height={height} radius={radius}>
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(30,10,5,0.75)']}
        style={[StyleSheet.absoluteFill, styles.pad, { borderRadius: radius }]}>
        <View style={styles.top}>
          {!!tag && (
            <View style={styles.tag}>
              <Type v="labelSm" color="#FFFFFF" numberOfLines={1}>
                {tag}
              </Type>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {children}
        </View>
        <Type
          v="titleLg"
          color="#FFFFFF"
          numberOfLines={3}
          style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2), fontWeight: '700' }}>
          {title}
        </Type>
      </LinearGradient>
    </MediaImage>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, justifyContent: 'space-between' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  tag: {
    maxWidth: '75%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});
