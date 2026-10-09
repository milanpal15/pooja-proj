import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Space, useTheme } from '@/theme';

/** Sticky bar at the foot of the player: offer chadhava during the aarti. */
export function OfferBar({ fromCoins, onPress }: { fromCoins: number; onPress: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: c.containerLowest, borderTopColor: c.outlineVariant, paddingBottom: Space.sm + insets.bottom },
      ]}>
      <View style={styles.text}>
        <Type v="titleSm">{t('ld_offer_title')}</Type>
        {fromCoins > 0 && (
          <Type v="bodySm" tone="onSurfaceVariant">
            {`${t('ld_offer_from')} ${fromCoins} ${t('ld_coins')}`}
          </Type>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.cta, { backgroundColor: c.accent }]}>
        <Type v="labelLg" color={c.onAccent}>
          {t('ld_offer_now')}
        </Type>
        <Icon name="chevronRight" size={16} color={c.onAccent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingHorizontal: Space.margin,
    paddingTop: 12,
  },
  text: { flex: 1 },
  cta: { height: 46, paddingHorizontal: 20, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
