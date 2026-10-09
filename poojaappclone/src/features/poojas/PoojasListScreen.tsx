import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Field, Icon, Screen, TitleBar, Type, useScrollPadding } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { pick } from '@/lib/localized';
import { Space, useTheme } from '@/theme';

import { FilterBar } from './components/FilterBar';
import { FilterSheet } from './components/FilterSheet';
import { PoojaListCard } from './components/PoojaListCard';
import { usePoojaList } from './hooks/use-pooja-list';

/**
 * Pooja Seva — everything bookable, filterable by festival / tithi / place.
 * `?temple=<slug>` (from the Temples tab) narrows it to one temple.
 */
export function PoojasListScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const scrollPad = useScrollPadding();
  const { temple, q } = useLocalSearchParams<{ temple?: string; q?: string }>();
  const [sheet, setSheet] = useState(false);
  const [searching, setSearching] = useState(!!q);
  const m = usePoojaList(temple || undefined, q ?? '');

  const options = m.data?.filters;
  const festival = options?.festivals.find((f) => f.slug === m.filters.festival);
  const templeName = options?.temples.find((x) => x.slug === temple)?.name ?? temple;
  const poojas = m.data?.poojas ?? [];

  return (
    <Screen tabBar={false} watermark>
      <TitleBar
        title={t('ps_title')}
        searching={searching}
        onSearch={() => setSearching((v) => !v)}
        onBookings={() => router.push('/my-bookings')}
      />
      {searching && (
        <View style={styles.search}>
          <Field
            icon="search"
            value={m.search}
            onChangeText={m.setSearch}
            placeholder={t('ps_search')}
            accessibilityLabel={t('ps_search')}
            returnKeyType="search"
            autoFocus
          />
        </View>
      )}
      <FilterBar
        filters={m.filters}
        festivalLabel={festival ? pick(lang, festival.name, festival.nameHi) : undefined}
        onOpen={() => setSheet(true)}
      />
      {!!temple && (
        <View style={[styles.templeBar, { backgroundColor: c.accentContainer }]}>
          <Icon name="temple" size={16} color={c.primary} />
          <Type v="labelMd" style={{ flex: 1 }} numberOfLines={1}>
            {fill(t('ps_temple_filter'), { name: templeName ?? '' })}
          </Type>
          <Button label={t('ps_temple_clear')} variant="ghost" size="sm" onPress={() => router.setParams({ temple: '' })} />
        </View>
      )}

      <AsyncState
        status={m.status}
        hasData={!!m.data}
        onRetry={m.reload}
        empty={poojas.length === 0}
        emptyTitle={t('ps_empty_title')}
        emptyBody={t('ps_empty_body')}
        skeletonHeight={300}>
        <FlatList
          data={poojas}
          keyExtractor={(p) => p.slug}
          contentContainerStyle={[styles.list, scrollPad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <PoojaListCard pooja={item} onOpen={() => router.push({ pathname: '/pooja/[slug]', params: { slug: item.slug } })} />
          )}
        />
      </AsyncState>

      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        options={options}
        value={m.filters}
        onToggle={m.toggle}
        onClear={m.clear}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  templeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.margin,
    paddingRight: Space.sm,
  },
  list: { paddingHorizontal: Space.md, paddingTop: Space.xs, gap: Space.md },
});
