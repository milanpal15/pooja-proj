import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CallIcon } from '@/components/call-icons';
import { Type } from '@/components/ui';
import { useAdmin } from '@/providers/admin';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/fill';
import { Kumkum, Radius, Saffron, useTheme } from '@/theme';

import { useAstrologers } from '../hooks/use-astrologers';

/**
 * Home's "Talk to an Astrologer" card: a warm gradient strip with a Call button.
 * Hidden entirely when the `astrologerCalls` flag is off. The "N online now" line
 * appears only when the live list says someone is online — never as a guess.
 */
export function AstrologerEntryCard() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { t } = useLanguage();
  const router = useRouter();
  const { flags } = useAdmin();
  const { onlineCount } = useAstrologers();

  if (!flags.astrologerCalls) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('astro_entry_title')}
      onPress={() => router.push('/astrologers')}>
      <LinearGradient
        colors={dark ? [c.containerLow, c.containerLow] : [Saffron[50], Kumkum[100]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.row}>
        <View style={[styles.medallion, { backgroundColor: c.accentContainer }]}>
          <CallIcon name="sun" size={26} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Type v="titleMd" color={dark ? c.onSurface : Kumkum[700]} numberOfLines={1}>
            {t('astro_entry_title')}
          </Type>
          <Type v="bodySm" color={dark ? c.onSurfaceVariant : Saffron[700]} numberOfLines={2}>
            {onlineCount > 0 ? fill(t('astro_online_now'), { n: onlineCount }) : t('astro_entry_sub')}
          </Type>
        </View>
        <View style={[styles.call, { backgroundColor: c.primary }]}>
          <Type v="labelLg" color={c.onPrimary}>
            {t('astro_btn_call')}
          </Type>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.xl, paddingVertical: 14, paddingHorizontal: 14 },
  medallion: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  call: { height: 38, paddingHorizontal: 18, borderRadius: 19, justifyContent: 'center' },
});
