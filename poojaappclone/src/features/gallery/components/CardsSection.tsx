import { StyleSheet, View } from 'react-native';

import { Card, Type } from '@/components/ui';
import { Space } from '@/theme';

import { Section } from './Section';

export function CardsSection() {
  return (
    <Section title="Cards">
      <View style={styles.stack}>
        <Card>
          <Type v="titleMd">Plain</Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            White container, hairline border. The default list card.
          </Type>
        </Card>
        <Card variant="ornate">
          <Type v="titleMd" tone="goldInk">
            Ornate
          </Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            Gold hairline and a mandala watermark at 5%. Featured content
            only — an ornament used everywhere stops being one.
          </Type>
        </Card>
        <Card variant="sunken">
          <Type v="titleMd">Sunken</Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            Tonal, borderless. Settings groups and payment summaries.
          </Type>
        </Card>
        <Card variant="glass">
          <Type v="titleMd">Glass</Type>
          <Type v="bodySm" tone="onSurfaceVariant">
            Frosted. Switch the surface toggle to Sanctum to see it work.
          </Type>
        </Card>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Space.sm },
});
