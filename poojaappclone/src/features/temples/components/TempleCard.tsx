import { Pressable, StyleSheet, View } from 'react-native';

import { TempleGlyph } from '@/components/illustrations/temple-glyph';
import { Button, Card, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { formatDistance } from '@/lib/geo';
import { Radius, Space, useTheme } from '@/theme';

import { formatCount } from '../lib/format-count';

type TempleRow = React.ComponentProps<typeof TempleGlyph>['temple'] & {
  id: string;
  name: string;
  location: string;
  km?: number;
};

export function TempleCard({
  temple: tpl,
  saved,
  rating,
  bookingEnabled,
  chadhavaEnabled,
  onToggleSave,
  onBook,
  onChadhava,
  onNavigate,
}: {
  temple: TempleRow;
  saved: boolean;
  /** A real dashboard rating, or undefined — in which case nothing is shown. */
  rating: { rating: number; reviews?: number } | undefined;
  bookingEnabled: boolean;
  chadhavaEnabled: boolean;
  onToggleSave: () => void;
  onBook: () => void;
  onChadhava: () => void;
  onNavigate: () => void;
}) {
  const { c } = useTheme();
  const { t, lang } = useLanguage();

  return (
    <Card variant="ornate">
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
              onPress={onToggleSave}
              style={[styles.heartBtn, { backgroundColor: c.accentContainer }]}>
              <Icon
                name="heart"
                size={18}
                color={saved ? c.primary : c.onSurfaceFaint}
                filled={saved}
              />
            </Pressable>
          </View>
          {/* Only shown when the dashboard has a real rating for this
              temple. It used to print one invented figure for all. */}
          {rating && (
            <View style={styles.metaRow}>
              <Icon name="star" size={13} color={c.gold} filled />
              <Type v="bodySm" tone="onSurfaceVariant">
                {rating.reviews
                  ? t('stars_reviews_n')
                      .replace('{rating}', rating.rating.toFixed(1))
                      .replace('{count}', formatCount(rating.reviews, lang === 'hi' ? 'hi' : 'en'))
                  : t('stars_only').replace('{rating}', rating.rating.toFixed(1))}
              </Type>
            </View>
          )}
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
        {bookingEnabled && (
          <Button label={t('book_pooja')} size="sm" style={styles.action} onPress={onBook} />
        )}
        {chadhavaEnabled && (
          <Button
            label={t('offer_chadhava')}
            variant="secondary"
            size="sm"
            icon="marigold"
            style={styles.action}
            onPress={onChadhava}
          />
        )}
      </View>

      {/* Navigate is the least valuable of the three, so it sits under the
          two that matter rather than competing with them. */}
      <Button
        label={t('navigate')}
        variant="outline"
        size="sm"
        icon="mapPin"
        block
        style={styles.navigate}
        onPress={onNavigate}
      />

      {!bookingEnabled && (
        <Type v="labelSm" tone="onSurfaceFaint" style={styles.bookingOff}>
          {t('booking_off')}
        </Type>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head2: { flexDirection: 'row', gap: Space.sm, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Space.xs },
  heartBtn: { width: 32, height: 32, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  glyphWrap: { width: 72, height: 72, justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  actions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md },
  bookingOff: { marginTop: 6 },
  navigate: { marginTop: Space.sm },
  action: { flex: 1 },
});
