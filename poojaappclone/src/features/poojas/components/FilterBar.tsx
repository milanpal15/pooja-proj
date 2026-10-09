import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { activeCount, type PoojaFilterState } from '../lib/filters';

/** Filter + Festival / Tithi / Place chips. Every chip opens the same sheet. */
export function FilterBar({
  filters,
  festivalLabel,
  onOpen,
}: {
  filters: PoojaFilterState;
  /** The chosen festival's display name — the state holds its slug. */
  festivalLabel?: string;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const n = activeCount(filters);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      <Chip icon="filter" plain label={n ? `${t('ps_filter')} (${n})` : t('ps_filter')} selected={n > 0} onPress={onOpen} />
      <Chip plain trailing="chevronDown" label={festivalLabel || t('ps_festival')} selected={!!filters.festival} onPress={onOpen} />
      <Chip plain trailing="chevronDown" label={filters.tithi || t('ps_tithi')} selected={!!filters.tithi} onPress={onOpen} />
      <Chip plain trailing="chevronDown" label={filters.place || t('ps_place')} selected={!!filters.place} onPress={onOpen} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: Space.md, gap: Space.sm, paddingTop: Space.xs, paddingBottom: Space.sm + 4 },
});
