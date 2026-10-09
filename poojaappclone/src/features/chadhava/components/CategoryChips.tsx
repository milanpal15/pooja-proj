import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { ChadhavaCategory } from '@/lib/api';
import { pick } from '@/lib/localized';
import { assetUrl } from '@/providers/content';
import { Gold, Kumkum, Saffron, Sandal, Status, useTheme } from '@/theme';

/** Toned discs for categories without a picture, cycled by position. */
const TONES = [
  [Gold[100], Saffron[500]],
  [Sandal[800], Sandal[950]],
  [Saffron[200], Kumkum[600]],
  [Status.successDark, Status.successLight],
  [Kumkum[300], Kumkum[700]],
] as const;

/** "All" plus the API's categories as 60px circles with the label beneath; hidden when there are none. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: ChadhavaCategory[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const { t, lang } = useLanguage();
  if (categories.length === 0) return null;
  const items = [
    { slug: '', label: t('cs_all'), image: '' },
    ...categories.map((c) => ({ slug: c.slug, label: pick(lang, c.name, c.nameHi), image: c.image })),
  ];
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((it, i) => (
          <Cat key={it.slug || 'all'} {...it} tone={TONES[i % TONES.length]} on={value === it.slug} onPress={() => onChange(it.slug)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Cat({
  label,
  image,
  tone,
  on,
  onPress,
}: {
  label: string;
  image: string;
  tone: readonly [string, string];
  on: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const src = assetUrl(image || undefined);
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={styles.cat}>
      <View style={[styles.ring, { borderColor: on ? Saffron[400] : 'transparent' }]}>
        {src ? (
          <Image source={{ uri: src }} style={styles.disc} accessibilityIgnoresInvertColors />
        ) : (
          <LinearGradient colors={tone as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.disc} />
        )}
      </View>
      <Type v="labelSm" color={on ? c.primary : c.onSurfaceVariant} center numberOfLines={2} style={styles.label}>
        {label}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 14, gap: 6, alignItems: 'flex-start' },
  cat: { width: 76, alignItems: 'center', gap: 6 },
  ring: { width: 66, height: 66, borderRadius: 33, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 60, height: 60, borderRadius: 30 },
  label: { fontSize: 11.5, lineHeight: 15, letterSpacing: 0, fontWeight: '600' },
});
