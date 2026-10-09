import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Type, ReadMore } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Kumkum, Saffron, useTheme } from '@/theme';

/** About (pink card), Benefits (numbered cards) and Included (numbered list). */
export function AboutBody({ pooja }: { pooja: PoojaDetail }) {
  const { t, lang } = useLanguage();
  const { c, scheme } = useTheme();
  return (
    <LinearGradient colors={scheme === 'dark' ? [c.containerLow, c.containerLow] : [Saffron[50], Kumkum[100]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.about}>
      <Type v="titleSm" style={{ marginBottom: 8, fontSize: 15 }}>
        {t('ps_h_about')}
      </Type>
      <ReadMore text={pick(lang, pooja.about, pooja.aboutHi)} v="bodySm" style={{ lineHeight: 21 }} />
    </LinearGradient>
  );
}

export function BenefitsBody({ items }: { items: PoojaDetail['benefits'] }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant, gap: 18 }]}>
      {items.map((b, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.num, { backgroundColor: c.successContainer, borderRadius: 8, width: 32, height: 32 }]}>
            <Type v="labelLg" tone="success" numeric>
              {String(i + 1).padStart(2, '0')}
            </Type>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Type v="titleSm" style={{ fontSize: 14 }}>
              {pick(lang, b.title, b.titleHi)}
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant" style={{ fontSize: 12.5, lineHeight: 19 }}>
              {pick(lang, b.text, b.textHi)}
            </Type>
          </View>
        </View>
      ))}
    </View>
  );
}

export function IncludedBody({ items }: { items: PoojaDetail['included'] }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  return (
    <View style={{ gap: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={styles.row}>
          <Type v="labelLg" color={c.outline} style={{ width: 14, opacity: 0.55 }} numeric>
            {i + 1}
          </Type>
          <Type v="bodySm" style={{ flex: 1, lineHeight: 20 }}>
            {pick(lang, it.text, it.textHi)}
          </Type>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  about: { borderRadius: 18, padding: 16 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  num: { alignItems: 'center', justifyContent: 'center' },
});
