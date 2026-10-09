import { StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { ArchImage, Badge, Type } from '@/components/ui';
import { Space } from '@/theme';

import { Section } from './Section';

export function ArchSection({ sampleArt }: { sampleArt: ImageSourcePropType | undefined }) {
  return (
    <Section title="Temple arch">
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        DESIGN.md calls this the signature shape; the export never drew it —
        every featured image came back a plain rounded rectangle.
      </Type>
      <ArchImage source={sampleArt} height={210}>
        <View style={styles.archOverlay}>
          <Badge label="LIVE" tone="live" />
          <Badge label="15.4K VIEWS" tone="primary" />
        </View>
      </ArchImage>
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
  archOverlay: {
    position: 'absolute',
    top: Space.md,
    left: Space.md,
    flexDirection: 'row',
    gap: 6,
  },
});
