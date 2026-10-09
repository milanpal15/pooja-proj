import { StyleSheet, View } from 'react-native';

import type { PoojaPackage } from '@/lib/api';

import { PackageCard } from './PackageCard';

/** Packages as a radio group; the chosen one expands with its perks and a Participate button. */
export function PackageList({
  packages,
  selected,
  disabled,
  onSelect,
  onParticipate,
}: {
  packages: PoojaPackage[];
  selected?: string;
  disabled?: boolean;
  onSelect: (key: string) => void;
  onParticipate: () => void;
}) {
  return (
    <View style={styles.col} accessibilityRole="radiogroup">
      {packages.map((p, i) => (
        <PackageCard
          key={p.key}
          pkg={p}
          index={i}
          on={p.key === selected}
          disabled={disabled}
          onSelect={() => onSelect(p.key)}
          onParticipate={onParticipate}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ col: { gap: 12 } });
