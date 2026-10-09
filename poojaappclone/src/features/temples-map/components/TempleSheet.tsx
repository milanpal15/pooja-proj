import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TempleGlyph } from '@/components/illustrations/temple-glyph';
import type { Temple } from '@/constants/temples';
import { BottomTabInset } from '@/theme';

/** Detail card for the selected temple, or the prompt to pick one. */
export function TempleSheet({
  selected,
  deityName,
  performLabel,
  placeholder,
  onPerform,
}: {
  selected: Temple | null;
  deityName: (slug: string) => string;
  performLabel: string;
  placeholder: string;
  onPerform: (t: Temple) => void;
}) {
  return (
    <View style={[styles.sheet, { paddingBottom: BottomTabInset + 24 }]}>
      {selected ? (
        <View style={[styles.card, { borderColor: selected.trim }]}>
          <View style={styles.cardRow}>
            <TempleGlyph temple={selected} size={78} />
            <View style={styles.cardText}>
              <Text style={styles.cardName}>{selected.name}</Text>
              <Text style={[styles.cardDeity, { color: selected.accent }]}>
                {deityName(selected.deity)}
              </Text>
              <Text style={styles.cardAarti}>{selected.aarti}</Text>
              <View style={styles.chips}>
                {selected.offerings.slice(0, 2).map((o) => (
                  <View key={o} style={[styles.chip, { borderColor: selected.trim }]}>
                    <Text style={[styles.chipText, { color: selected.trim }]}>{o}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => onPerform(selected)}
            style={[styles.cta, { backgroundColor: selected.accent }]}>
            <Text style={styles.ctaText}>{performLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.placeholder}>{placeholder}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 16, paddingTop: 10 },
  placeholder: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 26,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cardText: { flex: 1, gap: 2 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardDeity: { fontSize: 12, fontWeight: '600' },
  cardAarti: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 5 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '600' },
  cta: { paddingVertical: 14, borderRadius: 999, alignItems: 'center' },
  ctaText: { color: '#1A1000', fontWeight: '700', fontSize: 15 },
});
