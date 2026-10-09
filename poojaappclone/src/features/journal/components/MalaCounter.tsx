import { StyleSheet, View } from 'react-native';

import { ProgressRing, Type } from '@/components/ui';
import { Space } from '@/theme';

import { MALA } from '../constants/mala';

import { RoundButton } from './RoundButton';

/** Japa counter: a real arc against a 108 mala, with one-more / one-less. */
export function MalaCounter({
  count,
  progress,
  caption,
  onMinus,
  onPlus,
}: {
  count: number;
  progress: number;
  /** "Mantras chanted", in the devotee's language. */
  caption: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.counterWrap}>
      <ProgressRing progress={progress} size={244} thickness={9}>
        <View style={styles.counterInner}>
          <Type v="bodyMd" tone="onSurfaceVariant">
            {caption}
          </Type>
          <View style={styles.counterRow}>
            <RoundButton icon="minus" label="One less" onPress={onMinus} />
            <Type v="numeral" numeric>
              {count}
            </Type>
            <RoundButton icon="plus" label="One more" onPress={onPlus} />
          </View>
          <Type v="labelSm" tone="goldInk">
            ॐ नमः शिवाय
          </Type>
        </View>
      </ProgressRing>
      <Type v="labelSm" tone="onSurfaceFaint">
        {Math.floor(count / MALA)} mala · {count % MALA}/{MALA}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  counterWrap: { alignItems: 'center', gap: Space.sm },
  counterInner: { alignItems: 'center', gap: 6 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
});
