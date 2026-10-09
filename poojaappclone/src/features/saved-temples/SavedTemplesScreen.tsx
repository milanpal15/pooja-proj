import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { Screen, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAdmin } from '@/providers/admin';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { useSavedTemples } from '@/lib/saved-temples';
import { Space } from '@/theme';

import { EmptySaved } from './components/EmptySaved';
import { SavedTempleCard } from './components/SavedTempleCard';

export function SavedTemplesScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { templeList, templeRating, bookingEnabled } = useContent();
  const { flags } = useAdmin();
  const scrollPad = useScrollPadding();
  const { savedIds, toggleSave, loading } = useSavedTemples();

  const savedTemples = useMemo(() => {
    return templeList.filter((tpl) => savedIds.includes(tpl.id));
  }, [savedIds, templeList]);

  return (
    <Screen tabBar={false} watermark>
      <AppBar title={t('saved_temples_title')} />

      <FlatList
        data={savedTemples}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.scroll, scrollPad]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading ? <EmptySaved onExplore={() => router.push('/temples')} /> : null
        }
        renderItem={({ item: tpl }) => (
          <SavedTempleCard
            temple={tpl}
            rating={templeRating(tpl.id)}
            bookingEnabled={bookingEnabled(tpl.id)}
            chadhavaEnabled={!!flags.chadhava}
            onUnsave={() => toggleSave(tpl.id)}
            onBook={() => router.push({ pathname: '/booking', params: { temple: tpl.id } })}
            onChadhava={() => router.push({ pathname: '/chadhava', params: { temple: tpl.id } })}
            onNavigate={() => router.push('/temples-map')}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Space.margin,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
});
