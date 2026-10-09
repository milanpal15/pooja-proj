import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { assetUrl } from '@/providers/content';
import { Radius, useTheme } from '@/theme';

import { compactCount, toneFor } from '../lib/live-logic';

/** The red LIVE badge. White on the live role in both schemes (a fixed-red chip, not a themed surface). */
export function LiveBadge({ small = false }: { small?: boolean }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.badge, { backgroundColor: c.live, height: small ? 20 : 24 }]}>
      <View style={styles.dot} />
      <Type v="labelSm" color="#FFFFFF" style={styles.badgeText}>
        {t('live')}
      </Type>
    </View>
  );
}

/** "1.2K watching" — rendered only when the number is real. */
export function ViewersPill({ viewers }: { viewers: number | null | undefined }) {
  const { t } = useLanguage();
  const n = compactCount(viewers);
  if (n === null) return null;
  return (
    <View style={styles.eye}>
      <Icon name="user" size={13} color="#FFFFFF" />
      <Type v="labelSm" color="#FFFFFF" numeric>
        {n} {t('ld_watching')}
      </Type>
    </View>
  );
}

/**
 * A stream's picture: its uploaded cover, or a warm gradient chosen from the slug.
 * Layers are laid out as siblings with their own radius (never a clipped parent), so Android draws them.
 */
export function Thumb({
  slug,
  cover,
  radius = Radius.md,
  style,
  children,
  dim = false,
}: {
  slug: string;
  cover?: string;
  radius?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
  /** Darken the bottom for overlaid text. */
  dim?: boolean;
}) {
  const [a, b] = toneFor(slug);
  const uri = assetUrl(cover || undefined);
  return (
    <View style={[{ borderRadius: radius }, style]}>
      <LinearGradient
        colors={[a, b]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.layer, { borderRadius: radius }]}
      />
      {!!uri && <Image source={{ uri }} resizeMode="cover" style={[styles.layer, { borderRadius: radius }]} />}
      {dim && (
        <LinearGradient
          colors={['rgba(0,0,0,0.12)', 'rgba(20,8,4,0.72)']}
          style={[styles.layer, { borderRadius: radius }]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: { letterSpacing: 0.6, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  eye: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
