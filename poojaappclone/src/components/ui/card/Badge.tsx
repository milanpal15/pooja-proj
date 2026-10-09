import { StyleSheet, View } from 'react-native';

import { Radius, useTheme } from '@/theme';

import { Type } from '../type';

export function Badge({
  label,
  tone = 'accent',
}: {
  label: string;
  tone?: 'accent' | 'primary' | 'live' | 'success';
}) {
  const { c } = useTheme();
  const bg =
    tone === 'live' ? c.live
    : tone === 'primary' ? c.primary
    : tone === 'success' ? c.success
    : c.accent;

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Type v="labelSm" color="#FFFFFF">
        {label}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
});
