import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Type } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * "Jai Shri Ram, <first name>": a gold-ringed initial (opens Profile), the
 * wallet chip (slot — only while astrologer calls are on) and the reminders
 * bell. No unread dot: the app has no notification feed to be unread.
 */
export function HomeHeader({
  greeting,
  name,
  initial,
  profileLabel,
  remindersLabel,
  wallet,
  onProfile,
  onReminders,
}: {
  greeting: string;
  name: string;
  initial: string;
  profileLabel: string;
  remindersLabel: string;
  wallet?: React.ReactNode;
  onProfile: () => void;
  onReminders: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileLabel}
        onPress={onProfile}
        style={[styles.avatar, { borderColor: c.gold }]}>
        <Type v="titleSm" tone="goldInk">
          {initial}
        </Type>
      </Pressable>
      <View style={styles.who}>
        <Type v="labelSm" tone="onSurfaceVariant" numberOfLines={1}>
          {greeting}
          {name ? ',' : ''}
        </Type>
        {!!name && (
          <Type v="titleMd" numberOfLines={1}>
            {name}
          </Type>
        )}
      </View>
      {wallet}
      <IconButton name="bell" label={remindersLabel} size={44} onPress={onReminders} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  who: { flex: 1 },
});
