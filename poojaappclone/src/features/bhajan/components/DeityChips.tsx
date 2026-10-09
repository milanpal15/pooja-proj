import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { useContent } from '@/providers/content';
import { Gold, Kumkum, Saffron, useTheme } from '@/theme';

const TONES = [
  [Gold[100], Saffron[500]],
  ['#4B6A8A', '#1F3550'],
  ['#E86A9A', '#A0134B'],
  ['#6BA0D6', '#2E6FA8'],
  [Saffron[200], Kumkum[600]],
] as const;

/** "Top 20" plus one round chip per deity that has music. Hidden when no track names a deity. */
export function DeityChips({
  deities,
  value,
  onChange,
}: {
  deities: string[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const { deityName, deityArt } = useContent();
  if (deities.length === 0) return null;

  const item = (slug: string, label: string, idx: number, art?: ReturnType<typeof deityArt>) => {
    const on = value === slug;
    return (
      <Pressable
        key={slug || 'top'}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(slug)}
        style={styles.item}>
        <View style={[styles.disc, { borderColor: on ? Gold[100] : 'rgba(255,255,255,0.2)', backgroundColor: c.containerHigh }]}>
          {art ? (
            <Image source={art} style={styles.img} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={TONES[idx % TONES.length] as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.img}>
              {!!slug && (
                <Type v="titleMd" color="#FFFFFF" center style={{ lineHeight: 52 }}>
                  {label.trim()[0]}
                </Type>
              )}
            </LinearGradient>
          )}
        </View>
        <Type v="labelSm" color={on ? Gold[100] : c.onSurfaceVariant} numberOfLines={1} center style={{ fontSize: 11.5, letterSpacing: 0 }}>
          {label}
        </Type>
      </Pressable>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {item('', t('bp_top20'), 0)}
      {deities.map((d, i) => item(d, deityName(d), i + 1, deityArt(d)))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingVertical: 2 },
  item: { width: 72, alignItems: 'center', gap: 6 },
  disc: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
});
