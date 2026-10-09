import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Field, Icon, Screen, TitleBar, Type, useScrollPadding } from '@/components/ui';
import { AsyncState } from '@/components/ui/async-state';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { useContent } from '@/providers/content';
import { Space, useTheme } from '@/theme';

import { CategoryChips } from './components/CategoryChips';
import { ListingCard } from './components/ListingCard';
import { useListings } from './hooks/use-listings';
import { listingsForTemple } from './lib/cart';

/** e-Chadhava listings. `?temple=<slug>` (Temples tab "Offer") narrows to one temple. */
export function ChadhavaListScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t } = useLanguage();
  const scrollPad = useScrollPadding();
  const { templeById } = useContent();
  const { temple } = useLocalSearchParams<{ temple?: string }>();
  const [category, setCategory] = useState('');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const m = useListings(category);

  const templeName = temple ? templeById(temple)?.name : undefined;
  const all = listingsForTemple(m.data?.listings ?? [], temple || undefined, templeName);
  const needle = q.trim().toLowerCase();
  const listings = needle
    ? all.filter((l) => `${l.title} ${l.titleHi} ${l.templeName} ${l.place}`.toLowerCase().includes(needle))
    : all;

  return (
    <Screen tabBar={false} watermark>
      <TitleBar
        title={t('cs_title')}
        searching={searching}
        onSearch={() => setSearching((v) => !v)}
        onBookings={() => router.push({ pathname: '/my-bookings', params: { tab: 'chadhava' } })}
      />
      {searching && (
        <View style={styles.search}>
          <Field icon="search" value={q} onChangeText={setQ} placeholder={t('cs_search')} accessibilityLabel={t('cs_search')} autoFocus />
        </View>
      )}
      <CategoryChips categories={m.data?.categories ?? []} value={category} onChange={setCategory} />
      {!!temple && (
        <View style={[styles.templeBar, { backgroundColor: c.accentContainer }]}>
          <Icon name="temple" size={16} color={c.primary} />
          <Type v="labelMd" style={{ flex: 1 }} numberOfLines={1}>
            {fill(t('cs_temple_filter'), { name: templeName ?? temple })}
          </Type>
          <Button label={t('cs_temple_clear')} variant="ghost" size="sm" onPress={() => router.setParams({ temple: '' })} />
        </View>
      )}
      <AsyncState
        status={m.status}
        hasData={!!m.data}
        onRetry={m.reload}
        empty={listings.length === 0}
        emptyTitle={t('cs_empty_title')}
        emptyBody={t('cs_empty_body')}
        skeletonHeight={260}>
        <FlatList
          data={listings}
          keyExtractor={(l) => l.slug}
          contentContainerStyle={[styles.list, scrollPad]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ListingCard listing={item} onOpen={() => router.push({ pathname: '/chadhava/[slug]', params: { slug: item.slug } })} />
          )}
        />
      </AsyncState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  templeBar: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingLeft: Space.margin, paddingRight: Space.sm },
  search: { paddingHorizontal: Space.md, paddingBottom: Space.sm },
  list: { paddingHorizontal: Space.md, paddingTop: Space.xs, gap: Space.md },
});
