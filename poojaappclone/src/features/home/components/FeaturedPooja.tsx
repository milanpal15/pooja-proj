import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

import { Banner } from './Banner';

/**
 * The festival promo: pooja artwork, a countdown chip, title, where/when, and
 * the booking button. White-on-scrim text is fixed (it sits on artwork); the
 * button uses the accent role so it flips correctly with the scheme.
 */
export function FeaturedPooja({
  seed,
  uri,
  chip,
  title,
  line,
  cta,
  onPress,
}: {
  seed: string;
  uri?: string;
  chip: string;
  title: string;
  line: string;
  cta: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Banner uri={uri} seed={seed} style={styles.box}>
      <View style={styles.over}>
        <View style={styles.chip}>
          <Type v="labelSm" color="#FFFFFF" numberOfLines={1}>
            {chip}
          </Type>
        </View>
        <View style={{ flex: 1 }} />
        <Type v="titleLg" color="#FFFFFF" numberOfLines={2} style={styles.title}>
          {title}
        </Type>
        {!!line && (
          <Type v="bodySm" color="#FFFFFF" numberOfLines={1} style={{ opacity: 0.92 }}>
            {line}
          </Type>
        )}
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.cta}>
          <LinearGradient colors={[...c.sunlight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Type v="labelMd" tone="onAccent" numberOfLines={1}>
            {cta} ›
          </Type>
        </Pressable>
      </View>
    </Banner>
  );
}

const styles = StyleSheet.create({
  box: { height: 220, borderRadius: 22 },
  over: { ...StyleSheet.absoluteFill, padding: 16, gap: 4 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  title: { textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  cta: { alignSelf: 'flex-start', height: 44, paddingHorizontal: 20, borderRadius: 22, overflow: 'hidden', justifyContent: 'center', marginTop: 10, maxWidth: '100%' },
});
