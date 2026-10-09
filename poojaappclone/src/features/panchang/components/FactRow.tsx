import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

export function FactRow({
  label,
  value,
  icon,
  good,
  bad,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  good?: boolean;
  bad?: boolean;
}) {
  const { c } = useTheme();
  const tint = good ? c.success : bad ? c.error : c.goldInk;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: c.containerLow }]}>
        <Icon name={icon} size={15} color={tint} />
      </View>
      <Type v="bodyMd" tone="onSurfaceVariant" style={{ flex: 1 }}>
        {label}
      </Type>
      <Type v="titleSm" numberOfLines={1}>
        {value}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
