import { StyleSheet, View } from 'react-native';

import { Badge, Chip } from '@/components/ui';
import { Space } from '@/theme';

import { Section } from './Section';

const noop = () => {};

export function ChipsSection() {
  return (
    <Section title="Chips & badges">
      <View style={styles.wrap}>
        {['51', '101', '251', '501'].map((amt, i) => (
          <Chip key={amt} label={amt} selected={i === 1} onPress={noop} />
        ))}
        <Chip label="Near Me" icon="mapPin" onPress={noop} />
      </View>
      <View style={[styles.wrap, { marginTop: Space.md }]}>
        <Badge label="LIVE" tone="live" />
        <Badge label="NEW" tone="accent" />
        <Badge label="VERIFIED" tone="success" />
        <Badge label="AARTI 7 PM" tone="primary" />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, alignItems: 'center' },
});
