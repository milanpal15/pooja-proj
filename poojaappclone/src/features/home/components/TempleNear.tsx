import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * A compact temple card with the Temples tab's actions. Book / Offer appear
 * only when that service is on for this temple; the distance only when a
 * position was already available.
 */
export function TempleNear({
  name,
  place,
  distance,
  saved,
  saveLabel,
  labels,
  onSave,
  onBook,
  onOffer,
  onNavigate,
}: {
  name: string;
  place: string;
  distance?: string;
  saved: boolean;
  saveLabel: string;
  labels: { book: string; offer: string; navigate: string };
  onSave: () => void;
  onBook?: () => void;
  onOffer?: () => void;
  onNavigate: () => void;
}) {
  const { c } = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.glyph, { backgroundColor: c.accentContainer }]}>
          <Icon name="temple" size={26} color={c.onAccentContainer} />
        </View>
        <View style={{ flex: 1 }}>
          <Type v="titleSm" numberOfLines={2}>
            {name}
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
            {place}
            {distance ? `  ·  ${distance}` : ''}
          </Type>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          accessibilityState={{ selected: saved }}
          onPress={onSave}
          style={[styles.save, { backgroundColor: c.accentContainer }]}>
          <Icon name="heart" size={20} color={saved ? c.primary : c.onAccentContainer} filled={saved} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        {onBook && <Button label={labels.book} size="sm" style={styles.act} onPress={onBook} />}
        {onOffer && <Button label={labels.offer} size="sm" variant="secondary" style={styles.act} onPress={onOffer} />}
        <Button label={labels.navigate} size="sm" variant="outline" icon="mapPin" style={styles.act} onPress={onNavigate} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  glyph: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  save: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  act: { flex: 1, paddingHorizontal: 8 },
});
