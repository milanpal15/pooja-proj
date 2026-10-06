import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { TempleGlyph } from '@/components/pooja/temple-glyph';
import {
  Button,
  Card,
  Icon,
  Screen,
  Type,
  useScrollPadding,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';

import { useAdmin } from '@/context/admin';
import { useContent } from '@/context/content';
import { useLanguage } from '@/context/language';
import { useSavedTemples } from '@/lib/saved-temples';
import { Radius, Space, useTheme } from '@/theme';

export default function SavedTemplesScreen() {
  const router = useRouter();
  const { c } = useTheme();
  const { t } = useLanguage();
  const { templeList, templeRating } = useContent();
  const { flags } = useAdmin();
  const { bookingEnabled } = useContent();
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
          !loading ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyMedallion, { backgroundColor: c.accentContainer }]}>
                <Icon name="temple" size={48} color={c.primary} />
              </View>
              <Type v="headlineMd" tone="goldInk" center>
                {t('no_saved_temples_title')}
              </Type>
              <Type v="bodyMd" tone="onSurfaceVariant" center style={styles.emptyDesc}>
                {t('no_saved_temples_desc')}
              </Type>
              <Button
                label={t('explore_temples')}
                icon="temple"
                size="md"
                onPress={() => router.push('/temples')}
                style={styles.emptyCta}
              />
            </View>
          ) : null
        }
        renderItem={({ item: tpl }) => (
          <Card key={tpl.id} variant="ornate">
            <View style={styles.head2}>
              <View style={styles.glyphWrap}>
                <TempleGlyph temple={tpl} size={72} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.titleRow}>
                  <Type v="titleMd" numberOfLines={2} style={{ flex: 1 }}>
                    {tpl.name}
                  </Type>
                  <Pressable
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle saved"
                    onPress={() => toggleSave(tpl.id)}
                    style={[styles.heartBtn, { backgroundColor: c.accentContainer }]}>
                    <Icon name="heart" size={18} color={c.primary} filled />
                  </Pressable>
                </View>
                {/* Same rule as the Temples tab: a rating appears only when
                    the dashboard has a real one for this temple. */}
                {(() => {
                  const r = templeRating(tpl.id);
                  if (!r) return null;
                  return (
                    <View style={styles.metaRow}>
                      <Icon name="star" size={13} color={c.gold} filled />
                      <Type v="bodySm" tone="onSurfaceVariant">
                        {t('stars_only').replace('{rating}', r.rating.toFixed(1))}
                      </Type>
                    </View>
                  );
                })()}
                <View style={styles.metaRow}>
                  <Icon name="mapPin" size={13} color={c.onSurfaceVariant} />
                  <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1} style={{ flex: 1 }}>
                    {tpl.location}
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

            <Button
              label={t('navigate')}
              variant="outline"
              size="sm"
              icon="mapPin"
              block
              style={styles.navigate}
              onPress={() => router.push('/temples-map')}
            />
          </Card>
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
  head2: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.xs,
  },
  heartBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphWrap: {
    width: 72,
    height: 72,
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  navigate: {
    marginTop: Space.sm,
  },
  action: {
    flex: 1,
  },
  /*
   * `alignSelf` is the point of this, not the margin.
   *
   * A Button that is not `block` sets `alignSelf: 'flex-start'` so it does
   * not stretch to fill a column — which also overrides the centred
   * container around it, leaving the call to action hard against the left
   * edge under centred text.
   */
  emptyCta: {
    marginTop: Space.md,
    alignSelf: 'center',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  emptyMedallion: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  emptyDesc: {
    marginTop: 4,
    lineHeight: 20,
  },
});
