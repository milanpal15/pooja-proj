import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import type { Festival } from '@/constants/festivals';
import { Radius, Space, useTheme } from '@/theme';

import { dayLabel } from '../lib/dates';

export function FestivalRow({
  festival: f,
  hi,
  art,
  onPress,
}: {
  festival: Festival;
  hi: boolean;
  art: ImageSourcePropType | undefined;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Card
      variant="sunken"
      style={styles.row}
      accessibilityLabel={hi ? f.nameHi : f.name}
      // Straight into that deity's aarti — the thing a devotee
      // actually wants on the day.
      onPress={onPress}>
      {art ? (
        <Image source={art} style={styles.art} contentFit="contain" />
      ) : (
        <View style={[styles.art, styles.artFallback, { borderColor: c.goldHairline }]}>
          <Type v="titleMd" tone="goldInk">
            ॐ
          </Type>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="titleSm" numberOfLines={2}>
          {hi ? f.nameHi : f.name}
        </Type>
        <Type v="labelSm" tone="primary">
          {dayLabel(f.date, hi)}
        </Type>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  art: { width: 48, height: 48, borderRadius: Radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
