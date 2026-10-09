import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { AppBar, Button, NoContent, Screen, Type, useScrollPadding } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { WalletChip } from '@/features/wallet';
import type { Astrologer } from '@/lib/api';
import { Space, useTheme } from '@/theme';

import { AstrologerCard } from './components/AstrologerCard';
import { FilterChips } from './components/FilterChips';
import { SearchField } from './components/SearchField';
import { StartCallSheet } from './components/StartCallSheet';
import { useAstrologers } from './hooks/use-astrologers';
import { type AstrologerFilter, applyFilter, specialitiesOf } from './lib/filter';

/** Container: the list of astrologers, filters, and the start-call sheet. */
export function AstrologersScreen() {
  const { c } = useTheme();
  const { t } = useLanguage();
  const pad = useScrollPadding();
  const { astrologers, loading, error, stale, refresh } = useAstrologers();
  const [filter, setFilter] = useState<AstrologerFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Astrologer | null>(null);

  const specialities = useMemo(() => specialitiesOf(astrologers), [astrologers]);
  const rows = useMemo(() => applyFilter(astrologers, filter, query), [astrologers, filter, query]);

  const empty = () => {
    if (loading) return <ActivityIndicator style={{ marginTop: Space.xl }} color={c.primary} />;
    if (error)
      return (
        <View style={styles.state}>
          <NoContent title={t('astro_error_title')} body={t('astro_error_body')} />
          <Button label={t('astro_retry')} variant="outline" onPress={refresh} />
        </View>
      );
    if (!astrologers.length)
      return <NoContent title={t('astro_empty_title')} body={t('astro_empty_body')} />;
    if (query.trim() || filter.startsWith('spec:'))
      return <NoContent title={t('astro_no_match')} body="" />;
    return <NoContent title={t('astro_none_online_title')} body={t('astro_none_online_body')} />;
  };

  return (
    <Screen tabBar={false}>
      <AppBar title={t('astro_entry_title')} right={<WalletChip />} />
      <View style={styles.top}>
        <SearchField value={query} onChange={setQuery} />
        <FilterChips specialities={specialities} value={filter} onChange={setFilter} />
        {stale && (
          <Type v="labelMd" tone="onSurfaceVariant" accessibilityRole="alert">
            {t('astro_stale')}
          </Type>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AstrologerCard astrologer={item} onCall={setSelected} />}
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        ListEmptyComponent={empty}
        ListFooterComponent={
          rows.length ? (
            <Type v="labelMd" tone="onSurfaceFaint" center style={{ marginTop: Space.md }}>
              {t('astro_footnote')}
            </Type>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, pad]}
      />
      <StartCallSheet astrologer={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: Space.margin, gap: Space.sm, paddingBottom: Space.sm },
  list: { paddingHorizontal: Space.margin, paddingTop: Space.xs },
  state: { alignItems: 'center', gap: Space.sm },
});
