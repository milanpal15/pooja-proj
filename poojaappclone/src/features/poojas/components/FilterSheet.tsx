import { StyleSheet, View } from 'react-native';

import { Button, Chip, Sheet, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { PoojaFilters } from '@/lib/api';
import { pick } from '@/lib/localized';
import { Space } from '@/theme';

import type { FilterKey, PoojaFilterState } from '../lib/filters';

type Props = {
  visible: boolean;
  onClose: () => void;
  options: PoojaFilters | undefined;
  value: PoojaFilterState;
  onToggle: (key: FilterKey, value: string) => void;
  onClear: () => void;
};

/**
 * Pick festival / tithi / place from the `filters` the API returned — only
 * values that actually have a bookable pooja. A section with no options is
 * hidden rather than shown empty.
 */
export function FilterSheet({ visible, onClose, options, value, onToggle, onClear }: Props) {
  const { t, lang } = useLanguage();
  const groups: { key: FilterKey; title: string; items: { value: string; label: string }[] }[] = [
    {
      key: 'festival',
      title: t('ps_festival'),
      items: (options?.festivals ?? []).map((f) => ({ value: f.slug, label: pick(lang, f.name, f.nameHi) })),
    },
    { key: 'tithi', title: t('ps_tithi'), items: (options?.tithis ?? []).map((x) => ({ value: x, label: x })) },
    { key: 'place', title: t('ps_place'), items: (options?.places ?? []).map((x) => ({ value: x, label: x })) },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title={t('ps_filter')}>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <View key={g.key} style={styles.group}>
            <Type v="titleSm" tone="goldInk">
              {g.title}
            </Type>
            <View style={styles.chips}>
              {g.items.map((i) => (
                <Chip key={i.value} label={i.label} selected={value[g.key] === i.value} onPress={() => onToggle(g.key, i.value)} />
              ))}
            </View>
          </View>
        ))}
      <Button label={t('ps_apply')} block onPress={onClose} />
      <Button label={t('ps_clear')} variant="ghost" block onPress={onClear} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: Space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
});
