import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space, useTheme } from '@/theme';

import { Icon, type IconName } from '../icon';
import { Type } from '../type';

/** A settings / profile row: tinted icon medallion, title, subtitle, chevron. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  last = false,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  last?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: c.outlineVariant },
        pressed && onPress ? { backgroundColor: c.container } : null,
      ]}>
      {!!icon && (
        <View style={[styles.medallion, { backgroundColor: c.accentContainer }]}>
          <Icon name={icon} size={20} color={c.primary} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Type v="titleMd" tone="goldInk">
          {title}
        </Type>
        {!!subtitle && (
          <Type v="bodySm" tone="onSurfaceVariant">
            {subtitle}
          </Type>
        )}
      </View>
      {right ?? (onPress ? <Icon name="forward" size={18} color={c.onSurfaceFaint} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: 14,
    paddingHorizontal: Space.cardPadding,
  },
  medallion: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
