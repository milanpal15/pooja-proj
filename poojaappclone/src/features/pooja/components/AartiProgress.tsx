import { StyleSheet, Text, View } from 'react-native';

import { BottomTabInset } from '@/theme';

export function AartiProgress({ headline, subline }: { headline: string; subline: string }) {
  return (
    <View style={[styles.progressPill, { bottom: BottomTabInset + 16 }]}>
      <Text style={styles.progressText}>{headline}</Text>
      <Text style={styles.mantraText}>{subline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progressPill: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(30,16,4,0.55)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 7,
    zIndex: 7,
  },
  progressText: { color: '#FFD98A', fontWeight: '700', fontSize: 14 },
  mantraText: { color: 'rgba(255,240,204,0.75)', fontSize: 11 },
});
