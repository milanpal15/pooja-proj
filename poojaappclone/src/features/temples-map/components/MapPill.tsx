import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName, Type } from '@/components/ui';

/** A floating map control: 44px tall, dark glass, readable over any map colour. */
export function MapPill({
  label,
  icon,
  busy,
  accent = '#FFC13D',
  onPress,
}: {
  label: string;
  icon?: IconName;
  busy?: boolean;
  accent?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, { borderColor: accent, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.icon}>
        {busy ? (
          <ActivityIndicator size="small" color={accent} />
        ) : icon ? (
          <Icon name={icon} size={16} color={accent} strokeWidth={2} />
        ) : null}
      </View>
      <Type v="labelMd" color="#FFFFFF" numberOfLines={1}>
        {label}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(24,8,6,0.88)',
  },
  icon: { width: 18, alignItems: 'center', justifyContent: 'center' },
});
