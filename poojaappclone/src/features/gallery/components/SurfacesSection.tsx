import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { type ColorRoles, Radius, Space, useTheme } from '@/theme';

import { Section } from './Section';

export function SurfacesSection() {
  const { c } = useTheme();
  return (
    <Section title="Surfaces">
      <View style={styles.wrap}>
        {(
          [
            'surface',
            'containerLowest',
            'containerLow',
            'container',
            'containerHigh',
            'containerHighest',
          ] as (keyof ColorRoles)[]
        ).map((k) => (
          <View key={k} style={styles.surfaceChip}>
            <View
              style={[
                styles.surfaceSwatch,
                { backgroundColor: c[k] as string, borderColor: c.outlineVariant },
              ]}
            />
            <Type v="labelSm" tone="onSurfaceFaint">
              {k}
            </Type>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' },
  surfaceChip: { alignItems: 'center', gap: 4, width: 96 },
  surfaceSwatch: { width: 96, height: 44, borderRadius: Radius.md, borderWidth: 1 },
});
