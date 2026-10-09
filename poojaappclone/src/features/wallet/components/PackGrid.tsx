import { StyleSheet, View } from 'react-native';

import type { CoinPack } from '@/lib/api';
import { Space } from '@/theme';

import { PackCard } from './PackCard';

type Props = {
  packs: CoinPack[];
  selectedId?: string;
  onSelect: (pack: CoinPack) => void;
  /** Three across and centred, for the sheet. Two across otherwise. */
  compact?: boolean;
};

export function PackGrid({ packs, selectedId, onSelect, compact = false }: Props) {
  return (
    <View accessibilityRole="radiogroup" style={[styles.grid, { paddingTop: 10 }]}>
      {packs.map((p) => (
        <View key={p.id} style={{ width: compact ? '31%' : '47.5%' }}>
          <PackCard pack={p} compact={compact} selected={p.id === selectedId} onPress={() => onSelect(p)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Space.md + 2 },
});
