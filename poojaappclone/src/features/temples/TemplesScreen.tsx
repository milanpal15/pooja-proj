import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { Screen, useScrollPadding } from '@/components/ui';
import { useAdmin } from '@/providers/admin';
import { useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { Space } from '@/theme';

import { EmptyTemples } from './components/EmptyTemples';
import { TempleCard } from './components/TempleCard';
import { TempleFilters } from './components/TempleFilters';
import { useTempleList } from './hooks/use-temple-list';

/**
 * Temple directory, with a working "Near Me".
 *
 * Distance is computed against the catalogue's own coordinates rather than
 * queried from Google Places. Five curated temples is a sort, not a metered
 * API call — see lib/geo.ts for why, and when that stops being true.
 *
 * The card previously showed a hardcoded "1.2 km away" on every temple,
 * regardless of where you were standing.
 */
export function TemplesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const { t } = useLanguage();
  const { bookingEnabled, templeRating } = useContent();
  const { flags } = useAdmin();
  const scrollPad = useScrollPadding();
  const m = useTempleList(params.search);

  return (
    <Screen watermark>
      <TempleFilters
        placeholder={t('search_temples')}
        query={m.query}
        onQuery={m.setQuery}
        labels={{
          nearMe: t('near_me'),
          saved: `${t('saved_temples_title')} (${m.savedIds.length})`,
          viewOnMap: t('view_on_map'),
        }}
        nearMe={m.nearMe}
        loc={m.loc}
        onlySaved={m.onlySaved}
        onToggleNearMe={m.toggleNearMe}
        onToggleSaved={() => m.setOnlySaved(!m.onlySaved)}
        onViewMap={() => router.push('/temples-map')}
        onRetryLocation={m.request}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {m.list.map((tpl) => (
          <TempleCard
            key={tpl.id}
            temple={tpl}
            saved={m.isSaved(tpl.id)}
            rating={templeRating(tpl.id)}
            bookingEnabled={bookingEnabled(tpl.id)}
            chadhavaEnabled={!!flags.chadhava}
            onToggleSave={() => m.toggleSave(tpl.id)}
            onBook={() => router.push({ pathname: '/poojas', params: { temple: tpl.id } })}
            onChadhava={() => router.push({ pathname: '/chadhava', params: { temple: tpl.id } })}
            onNavigate={() => router.push('/temples-map')}
          />
        ))}

        {m.list.length === 0 && <EmptyTemples onlySaved={m.onlySaved} query={m.query} />}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Space.margin, gap: Space.md },
});
