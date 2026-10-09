import { StyleSheet, View } from 'react-native';

import { Button, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

/** Shown when about a minute of balance remains. Persistent, so a Banner and not a toast. */
export function LowBalanceBanner({ onAddCoins }: { onAddCoins: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: c.accentContainer, borderColor: c.accent }]}>
      <Type v="bodySm" tone="onAccentContainer" style={{ flex: 1 }}>
        <Type v="labelLg" tone="onAccentContainer">
          {`${t('call_low_bold')} `}
        </Type>
        {t('call_low_rest')}
      </Type>
      <Button label={t('call_add_coins')} size="sm" onPress={onAddCoins} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.sm,
  },
});
