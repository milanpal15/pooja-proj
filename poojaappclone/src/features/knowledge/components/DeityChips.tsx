import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import type { Deity } from '@/constants/deities';
import { Space } from '@/theme';

/**
 * Switching deity keeps you on the screen rather than sending you
 * back to Home to pick another one.
 */
export function DeityChips({
  hi,
  ids,
  deityList,
  selectedId,
  onSelect,
}: {
  hi: boolean;
  ids: string[];
  deityList: Deity[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}>
      {ids.map((k) => {
        const d = deityList.find((x) => x.id === k);
        return (
          <Chip
            key={k}
            label={hi ? (d?.name ?? k) : (d?.title ?? k)}
            selected={k === selectedId}
            onPress={() => onSelect(k)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Space.sm, paddingVertical: 2, paddingRight: Space.sm },
});
