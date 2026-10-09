import { View } from 'react-native';

import { Card, Divider, Type } from '@/components/ui';
import { Space } from '@/theme';

import { Section } from './Section';

export function DividerSection() {
  return (
    <Section title="Divider">
      <Card variant="sunken">
        <Type v="bodySm">Neutral</Type>
        <View style={{ height: Space.sm }} />
        <Divider />
        <View style={{ height: Space.md }} />
        <Type v="bodySm">Gold — ornamental separation</Type>
        <View style={{ height: Space.sm }} />
        <Divider gold />
      </Card>
    </Section>
  );
}
