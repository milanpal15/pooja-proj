import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Elevation, Radius, Space, useTheme } from '@/theme';

import { Section } from './Section';

export function ElevationSection() {
  const { c } = useTheme();
  return (
    <Section title="Elevation">
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        Aura-glow, not grey shadow: a diffused saffron cast, so elements read
        as radiating light.
      </Type>
      <View style={styles.row}>
        {(['low', 'mid', 'high'] as const).map((step) => (
          <View
            key={step}
            style={[
              styles.elevBox,
              Elevation[step],
              { backgroundColor: c.containerLowest, shadowColor: c.glowTint },
            ]}>
            <Type v="labelSm" tone="onSurfaceFaint">
              {step}
            </Type>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', flexWrap: 'wrap' },
  elevBox: {
    width: 92,
    height: 72,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
