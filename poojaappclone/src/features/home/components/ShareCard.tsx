import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { STORE_URL } from '@/constants/app-links';
import { useLanguage } from '@/i18n';
import { Kumkum, Radius, Saffron, useTheme } from '@/theme';

/**
 * "Bring your family to Bhakti" — the platform share sheet. A local copy of
 * Profile's card (that feature does not export one and a feature may not
 * deep-import another); it reuses Profile's `bp_share_*` strings.
 */
export function ShareCard() {
  const { c, scheme } = useTheme();
  const { t } = useLanguage();
  const dark = scheme === 'dark';

  const share = () => {
    const message = STORE_URL ? `${t('bp_share_msg')} ${STORE_URL}` : t('bp_share_msg');
    Share.share({ message }).catch(() => {});
  };

  return (
    <LinearGradient colors={dark ? [c.containerLow, c.containerLow] : [Saffron[50], Kumkum[100]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.card}>
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="titleSm" color={dark ? c.onSurface : Kumkum[700]}>
          {t('bp_share_h')}
        </Type>
        <Type v="bodySm" color={dark ? c.onSurfaceVariant : Saffron[700]}>
          {t('bp_share_sub')}
        </Type>
      </View>
      <Pressable accessibilityRole="button" onPress={share} style={[styles.btn, { backgroundColor: c.primary }]}>
        <Type v="labelMd" color={c.onPrimary}>
          {t('bp_share_btn')}
        </Type>
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: { height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center' },
});
