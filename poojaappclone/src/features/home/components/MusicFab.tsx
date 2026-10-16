import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { BottomTabInset } from '@/theme';

/** The floating action button (music by default). Sits above the custom tab bar. */
export function MusicFab({ label, icon = 'music', onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.fab, { bottom: insets.bottom + BottomTabInset + 16 }]}>
      <Icon name={icon} size={24} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 16, width: 56, height: 56, borderRadius: 28, backgroundColor: '#C2185B', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#78143C', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
});
