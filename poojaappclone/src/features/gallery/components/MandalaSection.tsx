import { StyleSheet, View } from 'react-native';

import { Mandala } from '@/components/ui';
import { useTheme } from '@/theme';

import { Section } from './Section';

export function MandalaSection() {
  const { c } = useTheme();
  return (
    <Section title="Mandala">
      <View style={styles.mandalaRow}>
        <Mandala size={132} opacity={0.5} petals={16} />
        <Mandala size={132} opacity={0.5} petals={12} color={c.primary} />
        <Mandala size={132} opacity={0.28} petals={24} />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  mandalaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
