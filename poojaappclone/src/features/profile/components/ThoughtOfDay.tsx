import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

/** "Aaj ka Vichar" — the one place an ornate card is warranted. */
export function ThoughtOfDay({ title }: { title: string }) {
  const { c } = useTheme();
  return (
    <Card variant="ornate" style={styles.block}>
      <View style={styles.vicharHead}>
        <Icon name="sparkle" size={18} color={c.gold} />
        <Type v="titleMd" tone="goldInk">
          {title}
        </Type>
      </View>
      <Type v="bodyMd" style={styles.quote}>
        “Karmanye vadhikaraste Ma Phaleshu Kadachana, Ma Karmaphalaheturbhurma Te
        Sangostvakarmani.”
      </Type>
      <Type v="labelSm" tone="onSurfaceFaint">
        — BHAGAVAD GITA
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch', marginTop: Space.lg, gap: Space.sm },
  vicharHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  quote: { fontStyle: 'italic' },
});
