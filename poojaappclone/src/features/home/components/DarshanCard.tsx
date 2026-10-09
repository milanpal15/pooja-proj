import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * "Today's darshan and aarti" — the entry to the virtual mandir. A dark warm
 * card in both schemes (it is a lamp-lit scene, not a surface). The framed
 * portrait is the dashboard's deity artwork, or a toned plate with the name.
 */
export function DarshanCard({
  name,
  art,
  accent,
  line,
  title,
  sub,
  cta,
  onPress,
}: {
  name: string;
  art?: ImageSourcePropType;
  accent: string;
  /** "॥ Thursday, Bhadrapada, Trayodashi ॥" — empty when the panchang could not be computed. */
  line: string;
  title: string;
  sub: string;
  cta: string;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <LinearGradient colors={['#5A3A12', '#3A2410']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.card}>
      <View style={[styles.frame, { backgroundColor: accent }]}>
        {art ? (
          <Image source={art} style={styles.art} resizeMode="cover" />
        ) : (
          <Type v="labelSm" color="#FDE7B0" center style={styles.plate}>
            {name}
          </Type>
        )}
      </View>
      <View style={styles.text}>
        {!!line && (
          <View style={styles.pill}>
            <Type v="labelSm" color="#2A1A16" numberOfLines={1}>
              {line}
            </Type>
          </View>
        )}
        <Type v="titleMd" color="#FFFFFF">
          {title}
        </Type>
        <Type v="bodySm" color="#FFFFFF" style={styles.sub}>
          {sub}
        </Type>
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.cta}>
          <LinearGradient colors={[...c.sunlight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <Type v="labelMd" tone="onAccent">
            {cta} ›
          </Type>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' },
  frame: { width: 96, height: 124, borderRadius: 14, borderWidth: 2, borderColor: '#E9B43A', overflow: 'hidden', justifyContent: 'flex-end' },
  art: { width: '100%', height: '100%' },
  plate: { paddingBottom: 8 },
  text: { flex: 1, gap: 6, alignItems: 'flex-start' },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: '#F6D27A', maxWidth: '100%' },
  sub: { opacity: 0.85, fontSize: 12 },
  cta: { height: 40, paddingHorizontal: 16, borderRadius: 20, overflow: 'hidden', justifyContent: 'center', marginTop: 4 },
});
