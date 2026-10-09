import { StyleSheet } from 'react-native';

import { Card, Type } from '@/components/ui';
import { Space } from '@/theme';

import { PAIRS } from '../constants/samples';

import { ContrastRow } from './ContrastRow';
import { Section } from './Section';

export function ContrastSection() {
  return (
    <Section title="Contrast">
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        Each row measures the pair as it is actually rendered — button ink on
        button fill, not on the page. The only permitted Fail is `gold`,
        which is why it is ornament and never text.
      </Type>
      <Card variant="sunken" padded={false}>
        {PAIRS.map((pair, i) => (
          <ContrastRow key={pair.label} {...pair} last={i === PAIRS.length - 1} />
        ))}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
});
