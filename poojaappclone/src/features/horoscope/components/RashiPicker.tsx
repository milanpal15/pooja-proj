import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { Space } from '@/theme';

import { RASHIS } from '../constants/rashis';

/** Sign picker */
export function RashiPicker({
  hi,
  selectedId,
  onPick,
}: {
  hi: boolean;
  selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {RASHIS.map((r) => (
        <Chip
          key={r.id}
          label={hi ? r.nameHi : r.name}
          selected={r.id === selectedId}
          onPress={() => onPick(r.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Space.xs, paddingRight: Space.md },
});
