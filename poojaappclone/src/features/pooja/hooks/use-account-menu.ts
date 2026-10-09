import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/providers/auth';
import { useLanguage } from '@/i18n';

/** The avatar in the app bar: the devotee's initial, and the logout / language menu. */
export function useAccountMenu() {
  const { user, signOut } = useAuth();
  const { t, toggleLang } = useLanguage();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || 'अ';
  const confirmLogout = useCallback(() => {
    Alert.alert(
      t('logout_title'),
      user?.name ? `${t('signed_in_as')}: ${user.name}` : undefined,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('switch_language'), onPress: () => toggleLang() },
        { text: t('logout'), style: 'destructive', onPress: () => signOut() },
      ],
    );
  }, [user, signOut, t, toggleLang]);

  return { initial, confirmLogout };
}
