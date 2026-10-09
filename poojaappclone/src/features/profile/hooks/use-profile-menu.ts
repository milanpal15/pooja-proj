import { useRouter } from 'expo-router';
import { Linking } from 'react-native';

import { STORE_URL } from '@/constants/app-links';
import { useLanguage } from '@/i18n';
import { useAuth } from '@/providers/auth';
import { useTheme, useThemePreference } from '@/theme';

import type { ProfileMenuItem } from '../types';

/** The two row groups on Profile, with their navigation wired in. */
export function useProfileMenu(): { main: ProfileMenuItem[]; more: ProfileMenuItem[] } {
  const router = useRouter();
  const { user, devoteeView, setDevoteeView } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const { scheme } = useTheme();
  const { setPref } = useThemePreference();
  const dark = scheme === 'dark';

  const main: ProfileMenuItem[] = [
    {
      icon: 'diya',
      title: t('bp_my_bookings'),
      sub: t('bp_my_bookings_sub'),
      onPress: () => router.push('/my-bookings'),
    },
    {
      icon: 'heart',
      title: t('bp_fav_bhajans'),
      sub: t('bp_fav_bhajans_sub'),
      onPress: () => router.push({ pathname: '/bhajan', params: { view: 'favourites' } }),
    },
    {
      icon: 'temple',
      title: t('saved_temples'),
      sub: t('saved_temples_sub'),
      onPress: () => router.push('/saved-temples'),
    },
    {
      icon: 'bell',
      title: t('daily_reminders'),
      sub: t('daily_reminders_sub'),
      onPress: () => router.push('/alarm'),
    },
    {
      icon: 'globe',
      title: t('language_pref'),
      sub: lang === 'hi' ? 'हिंदी' : 'English',
      onPress: toggleLang,
    },
    // A plain on/off, as in the approved design. The subtitle states what is on now.
    {
      icon: 'moon',
      title: t('bp_dark_mode'),
      sub: dark ? t('bp_theme_dark_on') : t('bp_theme_light_on'),
      toggle: { value: dark, onChange: (on) => setPref(on ? 'dark' : 'light') },
    },
  ];

  const more: ProfileMenuItem[] = [
    // Only with a real store link — otherwise the row would go nowhere.
    ...(STORE_URL
      ? [
          {
            icon: 'star' as const,
            title: t('bp_rate'),
            sub: t('bp_rate_sub'),
            onPress: () => {
              Linking.openURL(STORE_URL).catch(() => {});
            },
          },
        ]
      : []),
    {
      icon: 'support',
      title: t('help_support'),
      sub: t('help_support_sub'),
      onPress: () => router.push('/help-support'),
    },
    // An astrologer looking at the app as a devotee can step back.
    ...(user?.role === 'astrologer' && devoteeView
      ? [
          {
            icon: 'person' as const,
            title: t('am_switch_astro'),
            sub: t('am_switch_astro_sub'),
            onPress: () => setDevoteeView(false),
          },
        ]
      : []),
  ];

  return { main, more };
}
