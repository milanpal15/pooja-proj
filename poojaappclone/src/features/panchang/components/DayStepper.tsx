import { Pressable, StyleSheet } from 'react-native';

import { Card, Type } from '@/components/ui';
import { Space } from '@/theme';

import { Stepper } from './Stepper';

/** Day stepper */
export function DayStepper({
  dayLabel,
  hi,
  offset,
  onShift,
  onToday,
}: {
  dayLabel: string;
  hi: boolean;
  offset: number;
  onShift: (delta: number) => void;
  onToday: () => void;
}) {
  return (
    <Card variant="sunken" style={styles.dayRow}>
      <Stepper icon="back" label="Previous day" onPress={() => onShift(-1)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to today"
        onPress={onToday}
        style={{ flex: 1 }}>
        <Type v="titleSm" center numberOfLines={2}>
          {dayLabel}
        </Type>
        {offset !== 0 && (
          <Type v="labelSm" tone="primary" center>
            {hi ? 'आज पर लौटें' : 'Back to today'}
          </Type>
        )}
      </Pressable>
      <Stepper icon="forward" label="Next day" onPress={() => onShift(1)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
});
