/**
 * What a screen shows when the dashboard has published nothing for it.
 *
 * This case did not exist while the app carried a bundled catalogue: there
 * was always a temple and always a deity, because a copy of both was
 * compiled in. With content coming only from the dashboard, "nothing yet"
 * is a real state — and the one screens must not paper over, because an
 * invented temple makes an unfilled dashboard look filled.
 *
 * Deliberately says who fills it rather than apologising. A devotee seeing
 * this is looking at a temple that has not finished setting up, not at a
 * broken app.
 */

import { StyleSheet, View } from 'react-native';

import { Card } from './card';
import { Type } from './type';
import { Space } from '@/theme';

export type NoContentProps = {
  /** Overrides the default heading. */
  title?: string;
  /** Overrides the default explanation. */
  body?: string;
  hi?: boolean;
};

export function NoContent({ title, body, hi = false }: NoContentProps) {
  return (
    <View style={styles.wrap}>
      <Card variant="sunken" style={styles.card}>
        <Type v="titleMd" center>
          {title ?? (hi ? 'अभी कुछ प्रकाशित नहीं हुआ' : 'Nothing published yet')}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant" center>
          {body ??
            (hi
              ? 'मंदिर द्वारा जोड़े जाते ही यहाँ दिखाई देगा।'
              : 'This will appear once the temple adds it.')}
        </Type>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: Space.margin },
  card: { alignItems: 'center', gap: Space.xs, paddingVertical: Space.xl },
});
