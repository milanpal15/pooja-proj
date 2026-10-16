import { StyleSheet, View } from 'react-native';

import { Button, Type } from '@/components/ui';
import { BottomTabInset } from '@/theme';

/** Compact card for a tapped OpenStreetMap temple: name, distance, deity, address, Directions. */
export function PlaceSheet({
  name,
  distance,
  deity,
  address,
  directionsLabel,
  onDirections,
}: {
  name: string;
  distance: string;
  deity: string | null;
  address: string | null;
  directionsLabel: string;
  onDirections: () => void;
}) {
  const meta = [distance, deity].filter(Boolean).join(' · ');
  return (
    <View style={[styles.sheet, { paddingBottom: BottomTabInset + 24 }]}>
      <View style={styles.card}>
        <Type v="titleMd" color="#FFFFFF" numberOfLines={2}>
          {name}
        </Type>
        {meta ? (
          <Type v="labelMd" color="#FFC13D" numberOfLines={1}>
            {meta}
          </Type>
        ) : null}
        {address ? (
          <Type v="bodySm" color="rgba(255,255,255,0.7)" numberOfLines={2}>
            {address}
          </Type>
        ) : null}
        <Button
          label={directionsLabel}
          icon="forward"
          variant="secondary"
          size="sm"
          onPress={onDirections}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 10 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 22,
    padding: 14,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cta: { marginTop: 8 },
});
