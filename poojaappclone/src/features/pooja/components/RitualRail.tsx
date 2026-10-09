import { StyleSheet, View } from 'react-native';

import { Marigold } from '@/components/illustrations/marigold';
import { Flame } from '@/components/illustrations/flame';

import { RailButton } from './RailButton';

/** The left-hand ritual rail: Auto Aarti, flowers, reset, collection. */
export function RitualRail({
  flowersOn,
  collectionLabel,
  onAuto,
  onToggleFlowers,
  onReset,
}: {
  flowersOn: boolean;
  collectionLabel: string;
  onAuto: () => void;
  onToggleFlowers: () => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.rail}>
      <RailButton active label="" onPress={onAuto}>
        <Flame size={13} color="#FFB63D" />
      </RailButton>
      <RailButton onPress={onToggleFlowers} active={flowersOn}>
        <Marigold size={26} />
      </RailButton>
      <RailButton onPress={onReset}>
        <View style={styles.shankh} />
      </RailButton>
      <RailButton label={collectionLabel}>
        <View style={styles.calendar}>
          <View style={styles.calendarTop} />
        </View>
      </RailButton>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { position: 'absolute', left: 10, bottom: 90, gap: 12, zIndex: 7 },
  shankh: {
    width: 24,
    height: 20,
    backgroundColor: '#FFF3DA',
    borderTopLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '-20deg' }],
  },
  calendar: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#FFF3DA',
    overflow: 'hidden',
  },
  calendarTop: { height: 7, backgroundColor: '#C0392B' },
});
