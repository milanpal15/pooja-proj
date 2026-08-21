import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Segmented,
  Icon,
  IconButton,
  ListRow,
  Screen,
  Type,
  useScrollPadding,
} from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAuth } from '@/context/auth';
import { useLanguage } from '@/context/language';
import { Radius, Space, type ThemePreference, useTheme, useThemePreference } from '@/theme';

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
export default function ProfileScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const { pref, setPref } = useThemePreference();
  const scrollPad = useScrollPadding();

  const initial = user?.name?.trim()?.[0]?.toUpperCase() || 'ॐ';
  const contact =
    user?.method === 'phone' ? `+91 ${user.contact}` : (user?.contact ?? 'India');

  const menu = [
    { icon: 'diya' as const, title: t('my_poojas'), sub: t('my_poojas_sub'), onPress: () => {} },
    {
      icon: 'temple' as const,
      title: t('saved_temples'),
      sub: t('saved_temples_sub'),
      onPress: () => {},
    },
    {
      icon: 'bell' as const,
      title: t('daily_reminders'),
      sub: t('daily_reminders_sub'),
      onPress: () => router.push('/alarm'),
    },
    {
      icon: 'globe' as const,
      title: t('language_pref'),
      sub: lang === 'hi' ? 'हिंदी' : 'English',
      onPress: toggleLang,
    },
    {
      icon: 'support' as const,
      title: t('help_support'),
      sub: t('help_support_sub'),
      onPress: () => {},
    },
  ];

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
        {/* Avatar under a gold ring — the export's most repeated ornament. */}
        <View style={[styles.ring, { borderColor: c.gold }]}>
          <View style={[styles.avatar, { backgroundColor: c.accentContainer }]}>
            <Type v="numeral" tone="goldInk">
              {initial}
            </Type>
          </View>
        </View>

        <Type v="headlineLg" tone="goldInk" center style={styles.name}>
          {user?.name || t('devotee')}
        </Type>
        <View style={styles.locationRow}>
          <Icon name="mapPin" size={14} color={c.onSurfaceVariant} />
          <Type v="bodySm" tone="onSurfaceVariant">
            {contact}
          </Type>
        </View>

        <Card variant="sunken" style={styles.block}>
          <View style={styles.themeHead}>
            <Icon name="sparkle" size={16} color={c.gold} />
            <Type v="titleMd" tone="goldInk">
              {t('appearance')}
            </Type>
          </View>
          <Segmented<ThemePreference>
            options={[
              { value: 'system', label: t('theme_system') },
              { value: 'light', label: t('theme_light') },
              { value: 'dark', label: t('theme_dark') },
            ]}
            value={pref}
            onChange={setPref}
          />
        </Card>

        <Card variant="sunken" padded={false} style={styles.block}>
          {menu.map((m, i) => (
            <ListRow
              key={m.title}
              icon={m.icon}
              title={m.title}
              subtitle={m.sub}
              onPress={m.onPress}
              last={i === menu.length - 1}
            />
          ))}
        </Card>

        {/* "Aaj ka Vichar" — the one place an ornate card is warranted. */}
        <Card variant="ornate" style={styles.block}>
          <View style={styles.vicharHead}>
            <Icon name="sparkle" size={18} color={c.gold} />
            <Type v="titleMd" tone="goldInk">
              {t('thought_of_day')}
            </Type>
          </View>
          <Type v="bodyMd" style={styles.quote}>
            “Karmanye vadhikaraste Ma Phaleshu Kadachana, Ma Karmaphalaheturbhurma Te
            Sangostvakarmani.”
          </Type>
          <Type v="labelSm" tone="onSurfaceFaint">
            — BHAGAVAD GITA
          </Type>
        </Card>

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
  ring: {
    width: 96,
    height: 96,
    borderRadius: Radius.full,
    borderWidth: 3,
    padding: 4,
    marginTop: Space.sm,
  },
  avatar: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: Space.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  block: { alignSelf: 'stretch', marginTop: Space.lg, gap: Space.sm },
  vicharHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  themeHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Space.sm },
  quote: { fontStyle: 'italic' },
  logout: { marginTop: Space.lg, marginBottom: Space.sm },
});
