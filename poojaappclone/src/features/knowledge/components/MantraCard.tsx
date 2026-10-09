import { StyleSheet, View } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The mantra is the reason many people open a screen like this, so it
 * sits above the prose rather than buried under it.
 */
export function MantraCard({ hi, mantra }: { hi: boolean; mantra: string }) {
  const { c } = useTheme();
  return (
    <Card variant="ornate">
      <View style={styles.mantraHead}>
        <Icon name="sparkle" size={16} color={c.gold} />
        <Type v="labelSm" tone="onSurfaceFaint">
          {hi ? 'मंत्र' : 'MANTRA'}
        </Type>
      </View>
      <Type v="mantra" tone="goldInk" center>
        {mantra}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  mantraHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
});
