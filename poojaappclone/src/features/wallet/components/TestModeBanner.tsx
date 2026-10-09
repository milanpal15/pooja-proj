import { StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, Space, useTheme } from '@/theme';

/** Shown only in dev builds, once the server says it is faking payments. */
export function TestModeBanner() {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { backgroundColor: c.accentContainer, borderColor: c.accent }]}>
      <Icon name="sparkle" size={16} color={c.onAccentContainer} />
      <Type v="labelMd" tone="onAccentContainer" style={{ flex: 1 }}>
        {t('test_payment_banner')}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
