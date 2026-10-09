import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import type { AstrologerFilter } from '../lib/filter';

export function FilterChips({
  specialities,
  value,
  onChange,
}: {
  specialities: string[];
  value: AstrologerFilter;
  onChange: (f: AstrologerFilter) => void;
}) {
  const { t } = useLanguage();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label={t('astro_filter_all')} selected={value === 'all'} onPress={() => onChange('all')} />
      <Chip
        label={t('astro_filter_online')}
        selected={value === 'online'}
        onPress={() => onChange('online')}
      />
      {specialities.map((s) => (
        <Chip key={s} label={s} selected={value === `spec:${s}`} onPress={() => onChange(`spec:${s}`)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: Space.xs, paddingRight: Space.md } });
