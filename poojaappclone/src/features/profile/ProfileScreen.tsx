import { ScrollView, StyleSheet } from 'react-native';

import { Button, IconButton, Screen, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAuth } from '@/providers/auth';
import { useLanguage } from '@/i18n';
import { Space, useTheme } from '@/theme';

import { CoinsCard } from './components/CoinsCard';
import { ProfileHeader } from './components/ProfileHeader';
import { ProfileMenu } from './components/ProfileMenu';
import { ShareCard } from './components/ShareCard';
import { ThoughtOfDay } from './components/ThoughtOfDay';
import { useProfileMenu } from './hooks/use-profile-menu';

/**
 * Profile — the "Enhanced Profile Management" screen from the export.
 *
 * Rebuilt on the design system. What the old version hand-rolled and this one
 * gets from the kit: the header, the row group and its dividers, the icon
 * medallions, the ornate quote card, the outline button, and the tab-bar
 * inset (which the old file hardcoded as 72 while `BottomTabInset` said 62 —
 * so the last row sat under the bar).
 *
 * The five menu emoji (🪔 🛕 🔔 🌐 💬) become real icons that take the theme.
 */
export function ProfileScreen() {
  const { c } = useTheme();
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const scrollPad = useScrollPadding();
  const menu = useProfileMenu();

  const initial = user?.name?.trim()?.[0]?.toUpperCase() || 'ॐ';
  // `contact` arrives already qualified — E.164 from a phone sign-in
  // (+919876543210) or the Google account's email — so it is shown as-is.
  // Space the country code out to keep a long number readable.
  const contact = user?.contact
    ? user.contact.replace(/^(\+\d{1,3})(\d+)$/, '$1 $2')
    : 'India';

  return (
    <Screen watermark>
      <AppBar
        brand={t('brand')}
        back={false}
        right={<IconButton name="bell" label={t('daily_reminders')} color={c.onSurface} />}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, scrollPad]}
        showsVerticalScrollIndicator={false}>
        <ProfileHeader initial={initial} name={user?.name || t('devotee')} contact={contact} />

        <CoinsCard />

        <ProfileMenu items={menu.main} />
        <ShareCard />
        <ProfileMenu items={menu.more} />

        <ThoughtOfDay title={t('thought_of_day')} />

        <Button
          label={t('logout')}
          variant="outline"
          icon="logout"
          block
          onPress={() => signOut()}
          style={styles.logout}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, alignItems: 'center' },
  logout: { marginTop: Space.lg, marginBottom: Space.sm },
});
