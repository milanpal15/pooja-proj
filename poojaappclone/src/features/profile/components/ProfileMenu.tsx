import { StyleSheet } from 'react-native';

import { Card, ListRow, Switch } from '@/components/ui';
import { Space } from '@/theme';

import type { ProfileMenuItem } from '../types';

export function ProfileMenu({ items }: { items: ProfileMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card variant="plain" padded={false} style={styles.block}>
      {items.map((m, i) => (
        <ListRow
          key={m.title}
          icon={m.icon}
          title={m.title}
          subtitle={m.sub}
          onPress={m.toggle ? () => m.toggle?.onChange(!m.toggle.value) : m.onPress}
          right={
            m.toggle ? (
              <Switch value={m.toggle.value} onValueChange={m.toggle.onChange} accessibilityLabel={m.title} />
            ) : undefined
          }
          last={i === items.length - 1}
        />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch', marginTop: Space.lg, gap: Space.sm },
});
