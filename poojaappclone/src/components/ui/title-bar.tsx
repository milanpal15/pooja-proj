/**
 * `TitleBar` — the list screens' header: back, a left-aligned bold title, a
 * circular search button (it reveals the screen's search field) and a
 * "My Bookings" pill.
 */

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import { IconButton } from './button';
import { CircleButton } from './circle-button';
import { Icon } from './icon';
import { Type } from './type';

export function TitleBar({
  title,
  searching,
  onSearch,
  onBookings,
}: {
  title: string;
  searching: boolean;
  onSearch: () => void;
  onBookings: () => void;
}) {
  const router = useRouter();
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <SafeAreaView edges={['top']}>
      <View style={styles.bar}>
        <IconButton name="back" label="Go back" size={40} color={c.onSurface} onPress={() => router.back()} />
        <Type v="titleLg" style={styles.title} numberOfLines={1}>
          {title}
        </Type>
        <CircleButton name="search" label={t('ps_search')} active={searching} onPress={onSearch} />
        <Pressable
          accessibilityRole="button"
          onPress={onBookings}
          style={[styles.pill, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
          <Icon name="bag" size={18} color={c.primary} />
          <Type v="labelMd" tone="primary" numberOfLines={1}>
            {t('ps_my_bookings')}
          </Type>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  title: { flex: 1, fontSize: 19 },
  pill: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
