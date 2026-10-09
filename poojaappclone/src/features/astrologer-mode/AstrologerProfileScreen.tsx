import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, ListRow, Screen, Type, useScrollPadding } from '@/components/ui';
import { AppBar } from '@/components/ui/surface';
import { useAuth } from '@/providers/auth';
import { useLanguage } from '@/i18n';
import { setMyPresence } from '@/lib/api';
import { Radius, Space, useTheme } from '@/theme';

/**
 * Astrologer profile: name, language, "switch to devotee view" and sign out.
 * Deliberately not the devotee profile — none of its menu (poojas, temples)
 * is reachable from the astrologer shell.
 */
export function AstrologerProfileScreen() {
  const { c } = useTheme();
  const { t, lang, toggleLang } = useLanguage();
  const { user, signOut, setDevoteeView } = useAuth();
  const pad = useScrollPadding();
  const name = user?.astrologer?.name || user?.name || t('am_role');

  return (
    <Screen watermark>
      <AppBar title={t('am_profile_title')} back={false} />
      <ScrollView contentContainerStyle={[styles.scroll, pad]}>
        <View style={[styles.ring, { borderColor: c.gold }]}>
          <View style={[styles.avatar, { backgroundColor: c.accentContainer }]}>
            <Type v="numeral" tone="goldInk">
              {name.trim()[0]?.toUpperCase() || 'ॐ'}
            </Type>
          </View>
        </View>
        <Type v="headlineLg" tone="goldInk" center>
          {name}
        </Type>
        <Type v="bodySm" tone="onSurfaceVariant" center>
          {t('am_role')}
          {user?.contact ? ` · ${user.contact}` : ''}
        </Type>

        <Card variant="sunken" padded={false} style={styles.block}>
          <ListRow
            icon="globe"
            title={t('language_pref')}
            subtitle={lang === 'hi' ? 'हिंदी' : 'English'}
            onPress={toggleLang}
          />
          <ListRow
            icon="person"
            title={t('am_switch_devotee')}
            subtitle={t('am_switch_devotee_sub')}
            last
            onPress={async () => {
              // Not on the phones of devotees as "Online" while browsing as one.
              await setMyPresence(false).catch(() => {});
              setDevoteeView(true);
            }}
          />
        </Card>

        <Button
          label={t('logout')}
          variant="outline"
          icon="logout"
          block
          style={styles.logout}
          onPress={async () => {
            await setMyPresence(false).catch(() => {});
            await signOut();
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Space.margin, alignItems: 'center', gap: Space.xs },
  ring: { width: 96, height: 96, borderRadius: Radius.full, borderWidth: 3, padding: 4, marginTop: Space.sm },
  avatar: { flex: 1, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  block: { alignSelf: 'stretch', marginTop: Space.lg },
  logout: { marginTop: Space.lg },
});
