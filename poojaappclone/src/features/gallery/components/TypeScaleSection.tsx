import { StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { Space, Type as TypeScale, type TypeVariant } from '@/theme';

import { SAMPLES } from '../constants/samples';

import { Section } from './Section';

/** The demo that justifies the third typeface. */
export function TypeScaleSection() {
  return (
    <Section title="Type scale">
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        Each step shown in both scripts. Devanagari resolves to Noto Sans at
        a matched weight — without it every Hindi string would fall back to
        the platform face.
      </Type>
      {(Object.keys(TypeScale) as TypeVariant[]).map((v) => (
        <View key={v} style={styles.typeRow}>
          <Type v="labelSm" tone="onSurfaceFaint">
            {v} · {TypeScale[v].fontSize}/{TypeScale[v].lineHeight} · {TypeScale[v].weight}
          </Type>
          <Type v={v} numberOfLines={1}>
            {SAMPLES[v].en}
          </Type>
          <Type v={v} tone="onSurfaceVariant" numberOfLines={1}>
            {SAMPLES[v].hi}
          </Type>
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
  typeRow: { marginBottom: Space.md, gap: 2 },
});
