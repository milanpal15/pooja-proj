import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { Coins, Icon, Type } from '@/components/ui';
import { MediaImage } from '@/components/ui/media-image';
import { useLanguage } from '@/i18n';
import type { PoojaPackage } from '@/lib/api';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { Gold, Kumkum, Saffron, useTheme } from '@/theme';

/** Toned thumbnails for packages without a picture, cycled by position. */
const TONES = [
  [Gold[100], Saffron[200], Saffron[500]],
  [Saffron[200], Saffron[500], Kumkum[600]],
  [Kumkum[200], Kumkum[400], Kumkum[700]],
  [Gold[200], Gold[400], Gold[500]],
] as const;

type Props = {
  pkg: PoojaPackage;
  index: number;
  on: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onParticipate: () => void;
};

export function PackageCard({ pkg: p, index, on, disabled, onSelect, onParticipate }: Props) {
  const { c, scheme } = useTheme();
  const { t, lang } = useLanguage();
  const perks = lang === 'hi' && p.perksHi.length ? p.perksHi : p.perks;
  const persons = p.persons === 1 ? t('ps_persons_one') : fill(t('ps_persons_n'), { n: p.persons });

  return (
    <LinearGradient
      colors={on ? [scheme === 'dark' ? c.containerHighest : Saffron[50], c.containerLowest] : [c.containerLowest, c.containerLowest]}
      style={[
        styles.card,
        { borderColor: on ? Saffron[400] : c.outlineVariant, borderWidth: 1.5, opacity: disabled ? 0.6 : 1 },
      ]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled}
        onPress={onSelect}
        style={styles.head}>
        <MediaImage uri={p.image} height={76} width={76} radius={12} colors={TONES[index % TONES.length]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Type v="titleMd" style={{ fontSize: 15 }}>
            {pick(lang, p.name, p.nameHi)}
          </Type>
          <View style={styles.persons}>
            <Icon name="user" size={14} color={c.primary} />
            <Type v="labelMd" tone="primary">
              {persons}
            </Type>
          </View>
          <View style={{ marginTop: 2 }}>
            <Coins value={p.coins} tone="goldInk" word />
          </View>
        </View>
        <View style={[styles.radio, { borderColor: on ? Saffron[400] : c.outline, borderWidth: on ? 7 : 2 }]} />
      </Pressable>

      {on && (
        <View style={{ gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={onParticipate} disabled={disabled}>
            <LinearGradient
              colors={c.sunlight as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.go}>
              <Type v="labelLg" tone="onAccent">
                {t('ps_participate')}
              </Type>
            </LinearGradient>
          </Pressable>
          {perks.map((perk) => (
            <View key={perk} style={styles.perk}>
              <Icon name="check" size={14} color={c.onSurface} strokeWidth={2.4} />
              <Type v="bodySm" style={{ flex: 1, fontSize: 12.5, lineHeight: 19 }}>
                {perk}
              </Type>
            </View>
          ))}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 12, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  persons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  radio: { width: 24, height: 24, borderRadius: 12 },
  go: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
