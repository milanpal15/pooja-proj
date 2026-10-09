import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';

// The design's one cool-toned row, so "how it works" reads as information, not an offering.
const TINT = { bg: '#EAF1FB', disc: '#C9DAF3', ink: '#1F3550' } as const;

/** "How your offering is made ›" — opens the HowSheet. */
export function HowRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, { backgroundColor: TINT.bg }]}>
      <View style={[styles.disc, { backgroundColor: TINT.disc }]}>
        <Icon name="sparkle" size={18} color={TINT.ink} />
      </View>
      <Type v="labelLg" color={TINT.ink} style={{ flex: 1, fontSize: 13.5 }}>
        {label}
      </Type>
      <Icon name="chevronRight" size={18} color={TINT.ink} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginTop: 4 },
  disc: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
