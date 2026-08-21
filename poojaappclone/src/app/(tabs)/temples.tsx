import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TempleGlyph } from '@/components/pooja/temple-glyph';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Screen,
  Type,
  useScrollPadding,
} from '@/components/ui';
import { TEMPLES } from '@/constants/temples';
import { useAdmin } from '@/context/admin';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { useLocation } from '@/hooks/use-location';
import { byDistanceFrom, formatDistance } from '@/lib/geo';
import { Space, useTheme } from '@/theme';

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

export default function TemplesScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t, lang } = useLanguage();
  const { bookingEnabled } = useContent();
  const { flags } = useAdmin();
  const scrollPad = useScrollPadding();
  const { state: loc, request, clear } = useLocation();

  const [query, setQuery] = useState('');
  const [nearMe, setNearMe] = useState(false);

  const q = query.trim().toLowerCase();

  // Ranked by distance only once we actually have a fix; otherwise the
  // catalogue keeps its curated order rather than silently reshuffling.
  const list = useMemo(() => {
    const ranked =
      nearMe && loc.status === 'granted'
        ? byDistanceFrom(loc.coords, TEMPLES)
        : TEMPLES.map((tpl) => ({ ...tpl, km: undefined as number | undefined }));

    return ranked.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(q) || tpl.location.toLowerCase().includes(q),
    );
  }, [nearMe, loc, q]);

  const toggleNearMe = () => {
    if (nearMe) {
      setNearMe(false);
      clear();
    } else {
      setNearMe(true);
      request();
    }
  };

  return (
    <Screen watermark>
      <SafeAreaView edges={['top']} style={styles.head}>
        <Field
          icon="search"
          value={query}
          onChangeText={setQuery}
          placeholder={t('search_temples')}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <View style={styles.controls}>
          <Chip
            label={t('near_me')}
            icon="mapPin"
            selected={nearMe && loc.status === 'granted'}
            onPress={toggleNearMe}
          />
          <Chip
            label={t('view_on_map')}
            icon="temple"
            onPress={() => router.push('/temples-map')}
          />
        </View>

        {/* Location state is reported inline rather than through an alert —
            a denied permission is a condition, not an interruption. */}
        {nearMe && loc.status !== 'granted' && (
          <View style={styles.locRow}>
            {loc.status === 'locating' ? (
              <>
                <ActivityIndicator size="small" color={c.primary} />
                <Type v="bodySm" tone="onSurfaceVariant">
                  {t('locating')}
                </Type>
              </>
            ) : (
              <>
                <Icon name="mapPin" size={14} color={c.error} />
                <Type v="bodySm" tone="error" style={{ flex: 1 }}>
                  {loc.status === 'denied' ? t('location_denied') : t('location_unavailable')}
                </Type>
                {loc.status === 'unavailable' && (
                  <Button label="Retry" variant="ghost" size="sm" onPress={request} />
                )}
              </>
            )}
          </View>
        )}

        {nearMe && loc.status === 'granted' && (
          <View style={styles.locRow}>
            <Icon name="check" size={14} color={c.success} strokeWidth={2.4} />
            <Type v="labelSm" tone="onSurfaceVariant">
              {t('nearest_first')}
            </Type>
          </View>
        )}
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {list.map((tpl) => (
          <Card key={tpl.id} variant="ornate">
            <View style={styles.head2}>
              <View style={styles.glyphWrap}>
                <TempleGlyph temple={tpl} size={72} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Type v="titleMd" numberOfLines={2}>
                  {tpl.name}
                </Type>
                <View style={styles.metaRow}>
                  <Icon name="star" size={13} color={c.gold} filled />
                  <Type v="bodySm" tone="onSurfaceVariant">
                    {t('stars_reviews')}
                  </Type>
                </View>
                <View style={styles.metaRow}>
                  <Icon name="mapPin" size={13} color={c.onSurfaceVariant} />
                  <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1} style={{ flex: 1 }}>
                    {tpl.location}
                    {tpl.km !== undefined && (
                      <Type v="bodySm" tone="primary">
                        {'  ·  '}
                        {formatDistance(tpl.km, lang === 'hi' ? 'hi' : 'en')} {t('away')}
                      </Type>
                    )}
                  </Type>
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              {bookingEnabled(tpl.id) && (
                <Button
                  label={t('book_pooja')}
                  size="sm"
                  style={styles.action}
                  onPress={() =>
                    router.push({ pathname: '/booking', params: { temple: tpl.id } })
                  }
                />
              )}
              {flags.chadhava && (
                <Button
                  label={t('offer_chadhava')}
                  variant="secondary"
                  size="sm"
                  icon="marigold"
                  style={styles.action}
                  onPress={() =>
                    router.push({ pathname: '/chadhava', params: { temple: tpl.id } })
                  }
                />
              )}
            </View>

            {/* Navigate is the least valuable of the three, so it sits under
                the two that matter rather than competing with them. */}
            <Button
              label={t('navigate')}
              variant="outline"
              size="sm"
              icon="mapPin"
              block
              style={styles.navigate}
              onPress={() => router.push('/temples-map')}
            />

            {!bookingEnabled(tpl.id) && (
              <Type v="labelSm" tone="onSurfaceFaint" style={styles.bookingOff}>
                {t('booking_off')}
              </Type>
            )}
          </Card>
        ))}

        {list.length === 0 && (
          <View style={styles.empty}>
            <Icon name="search" size={30} color={c.onSurfaceFaint} />
            <Type v="bodyMd" tone="onSurfaceVariant" center>
              No temples match “{query}”.
            </Type>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: Space.margin, paddingTop: Space.sm, gap: Space.sm },
  controls: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },

  scroll: { padding: Space.margin, gap: Space.md },
  head2: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  glyphWrap: { width: 72, height: 72, justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  actions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md },
  bookingOff: { marginTop: 6 },
  navigate: { marginTop: Space.sm },
  action: { flex: 1 },

  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
});
