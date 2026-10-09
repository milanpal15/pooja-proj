import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { RASHIS } from '@/features/horoscope';
import { useLanguage } from '@/i18n';
import { useTheme } from '@/theme';

import { SectionHead } from './SectionHead';

const SHOWN = 4;

/** "Aaj ka Rashifal": the first four signs from the horoscope feature's own list; each opens the Horoscope screen. */
export function RashiRow({ onOpen }: { onOpen: () => void }) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const hi = lang === 'hi';

  return (
    <View style={styles.wrap}>
      <SectionHead title={t('hv_rashifal')} link={t('hv_all_signs')} onLink={onOpen} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {RASHIS.slice(0, SHOWN).map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={`${r.nameHi} ${r.name}`}
            onPress={onOpen}
            style={[styles.tile, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
            <View style={[styles.mark, { backgroundColor: c.accentContainer }]}>
              <Type v="titleSm" tone="onAccentContainer">
                {r.mark}
              </Type>
            </View>
            <Type v="labelMd" numberOfLines={1}>
              {hi ? r.nameHi : r.name}
            </Type>
            <Type v="labelSm" tone="onSurfaceVariant" numberOfLines={1}>
              {hi ? r.name : r.western}
            </Type>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { gap: 10, paddingRight: 4 },
  tile: { width: 84, borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
