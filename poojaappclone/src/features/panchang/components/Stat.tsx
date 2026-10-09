import { StyleSheet } from 'react-native';

import { Card, Icon, Type } from '@/components/ui';
import { Space, useTheme } from '@/theme';

export function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Icon>['name'];
}) {
  const { c } = useTheme();
  return (
    <Card variant="sunken" style={styles.stat}>
      <Icon name={icon} size={20} color={c.gold} />
      <Type v="labelSm" tone="onSurfaceFaint">
        {label}
      </Type>
      <Type v="titleMd" numberOfLines={1}>
        {value}
      </Type>
    </Card>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: Space.md },
});
