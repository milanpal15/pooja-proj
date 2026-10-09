import { StyleSheet } from 'react-native';

import { Card, Type } from '@/components/ui';
import { Space } from '@/theme';

export function EmptyFestivals({ hi }: { hi: boolean }) {
  return (
    <Card variant="sunken" style={styles.empty}>
      <Type v="titleMd" center>
        {hi ? 'कोई आगामी तिथि नहीं' : 'No upcoming dates'}
      </Type>
      <Type v="bodySm" tone="onSurfaceVariant" center>
        {hi
          ? 'नया पंचांग जुड़ते ही तिथियाँ यहाँ दिखेंगी।'
          : 'Dates will appear here once the new calendar is published.'}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Space.xs, paddingVertical: Space.xl },
});
