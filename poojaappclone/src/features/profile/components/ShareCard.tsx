import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { STORE_URL } from '@/constants/app-links';
import { useLanguage } from '@/i18n';
import { Kumkum, Radius, Saffron, Space, useTheme } from '@/theme';

/** "Bring your family to Bhakti" — the platform share sheet with text (+ the store URL when configured). */
export function ShareCard() {
  const { c, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { t } = useLanguage();
  const share = () => {
    const message = STORE_URL ? `${t('bp_share_msg')} ${STORE_URL}` : t('bp_share_msg');
    Share.share({ message }).catch(() => {});
  };
  return (
    <LinearGradient colors={dark ? [c.containerLow, c.containerLow] : [Saffron[50], Kumkum[100]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.card}>
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="titleMd" color={dark ? c.onSurface : Kumkum[700]}>
          {t('bp_share_h')}
        </Type>
        <Type v="bodySm" color={dark ? c.onSurfaceVariant : Saffron[700]}>
          {t('bp_share_sub')}
        </Type>
      </View>
      <Pressable accessibilityRole="button" onPress={share} style={[styles.btn, { backgroundColor: c.primary }]}>
        <Type v="labelLg" color={c.onPrimary}>
          {t('bp_share_btn')}
        </Type>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: Space.md, marginTop: Space.lg, borderRadius: Radius.xl, padding: Space.md },
  btn: { height: 44, paddingHorizontal: 22, borderRadius: 22, justifyContent: 'center' },
});
