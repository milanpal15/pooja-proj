import { StyleSheet, View } from 'react-native';

import { ReadMore, Type } from '@/components/ui';
import { MediaImage } from '@/components/ui/media-image';
import { useLanguage } from '@/i18n';
import type { PoojaDetail } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Gold, Saffron, useTheme } from '@/theme';

/** Process (white card, soft numbered circles) and Temple (banner over a green-tinted card). */
export function ProcessBody({ items }: { items: PoojaDetail['process'] }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant, gap: 14, padding: 14 }]}>
      {items.map((s, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.circle, { backgroundColor: c.accentContainer }]}>
            <Type v="labelMd" tone="onAccentContainer" numeric>
              {i + 1}
            </Type>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Type v="titleSm" style={{ fontSize: 14 }}>
              {pick(lang, s.title, s.titleHi)}
            </Type>
            <Type v="bodySm" tone="onSurfaceVariant" style={{ fontSize: 12.5, lineHeight: 19 }}>
              {pick(lang, s.text, s.textHi)}
            </Type>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TempleBody({ temple }: { temple: NonNullable<PoojaDetail['temple']> }) {
  const { c } = useTheme();
  const { lang } = useLanguage();
  return (
    <View style={[styles.card, { backgroundColor: c.successContainer, borderWidth: 0, overflow: 'hidden' }]}>
      <MediaImage uri={temple.image} height={130} colors={[Gold[400], Gold[200], Saffron[100]]} />
      <View style={{ padding: 14, gap: 4 }}>
        <Type v="titleSm" style={{ fontSize: 15 }}>
          {temple.name}
        </Type>
        <ReadMore text={pick(lang, temple.about, temple.aboutHi)} v="bodySm" style={{ fontSize: 12.5, lineHeight: 19 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
