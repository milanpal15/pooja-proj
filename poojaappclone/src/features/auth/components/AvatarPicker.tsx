import { StyleSheet, View } from 'react-native';

import { Button, Type } from '@/components/ui';
import { Radius, Space, useTheme } from '@/theme';

/**
 * NOTE: the "Change photo" button has no handler and no picker exists —
 * kept exactly as it was before the split.
 */
export function AvatarPicker({ label, initial }: { label: string; initial?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.avatarWrap}>
      <View style={[styles.avatarRing, { borderColor: c.gold }]}>
        <View style={[styles.avatar, { backgroundColor: c.accentContainer }]}>
          <Type v="numeral" tone="goldInk">
            {initial?.toUpperCase() || 'ॐ'}
          </Type>
        </View>
      </View>
      <Button label={label} variant="ghost" size="sm" icon="plus" />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', gap: Space.xs },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: Radius.full,
    borderWidth: 3,
    padding: 4,
  },
  avatar: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
