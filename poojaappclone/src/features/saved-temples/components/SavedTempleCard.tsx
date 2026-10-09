import { Pressable, StyleSheet, View } from 'react-native';

import { TempleGlyph } from '@/components/illustrations/temple-glyph';
import { Button, Card, Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

type TempleRow = React.ComponentProps<typeof TempleGlyph>['temple'] & {
  id: string;
  name: string;
  location: string;
};

export function SavedTempleCard({
  temple: tpl,
  rating,
  bookingEnabled,
  chadhavaEnabled,
  onUnsave,
  onBook,
  onChadhava,
  onNavigate,
}: {
  temple: TempleRow;
  /** A real dashboard rating, or undefined — in which case nothing is shown. */
  rating: { rating: number; reviews?: number } | undefined;
  bookingEnabled: boolean;
  chadhavaEnabled: boolean;
  onUnsave: () => void;
  onBook: () => void;
  onChadhava: () => void;
  onNavigate: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();

  return (
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
              onPress={onUnsave}
              style={[styles.heartBtn, { backgroundColor: c.accentContainer }]}>
              <Icon name="heart" size={18} color={c.primary} filled />
            </Pressable>
          </View>
          {/* Same rule as the Temples tab: a rating appears only when
              the dashboard has a real one for this temple. */}
          {rating && (
            <View style={styles.metaRow}>
              <Icon name="star" size={13} color={c.gold} filled />
              <Type v="bodySm" tone="onSurfaceVariant">
                {t('stars_only').replace('{rating}', rating.rating.toFixed(1))}
              </Type>
            </View>
          )}
          <View style={styles.metaRow}>
            <Icon name="mapPin" size={13} color={c.onSurfaceVariant} />
            <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1} style={{ flex: 1 }}>
              {tpl.location}
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

      <Button
        label={t('navigate')}
        variant="outline"
        size="sm"
        icon="mapPin"
        block
        style={styles.navigate}
        onPress={onNavigate}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
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
});
