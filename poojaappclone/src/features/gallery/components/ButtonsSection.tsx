import { StyleSheet, View } from 'react-native';

import { Button, IconButton, Type } from '@/components/ui';
import { Space } from '@/theme';

import { Section } from './Section';

export function ButtonsSection() {
  return (
    <Section title="Buttons">
      <Type v="bodySm" tone="onSurfaceVariant" style={styles.note}>
        One `primary` per screen — the scarcity is what makes it read as the
        button. `glass` is for sanctum surfaces only.
      </Type>
      <View style={styles.stack}>
        <Button label="Offer 106 coins" icon="gift" block />
        <Button label="Navigate" variant="secondary" icon="mapPin" block />
        <Button label="Logout" variant="outline" icon="logout" block />
        <Button label="Resend code" variant="ghost" block />
        <Button label="Shankh Naad" variant="glass" icon="shankh" block />
        <View style={styles.row}>
          <Button label="Small" size="sm" />
          <Button label="Medium" size="md" />
        </View>
        <View style={styles.row}>
          <Button label="Loading" loading />
          <Button label="Disabled" disabled />
        </View>
        <View style={styles.row}>
          <IconButton name="back" label="Back" />
          <IconButton name="settings" label="Settings" variant="glass" />
          <IconButton name="heart" label="Like" variant="solid" />
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: Space.sm },
  stack: { gap: Space.sm },
  row: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', flexWrap: 'wrap' },
});
