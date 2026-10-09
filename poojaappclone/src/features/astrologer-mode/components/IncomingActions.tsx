import { Pressable, StyleSheet, View } from 'react-native';

import { CallIcon } from '@/components/call-icons';
import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

/** Decline (red) · Accept (green), each with a word under the glyph. */
export function IncomingActions({
  onDecline,
  onAccept,
  disabled,
}: {
  onDecline: () => void;
  onAccept: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('inc_decline')}
          disabled={disabled}
          onPress={onDecline}
          style={[styles.btn, { backgroundColor: c.live, opacity: disabled ? 0.5 : 1 }]}>
          <CallIcon name="phoneEnd" size={30} color="#FFFFFF" />
        </Pressable>
        <Type v="labelLg">{t('inc_decline')}</Type>
      </View>
      <View style={styles.cell}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('inc_accept')}
          disabled={disabled}
          onPress={onAccept}
          style={[styles.btn, { backgroundColor: c.success, opacity: disabled ? 0.5 : 1 }]}>
          <CallIcon name="phone" size={30} color="#FFFFFF" />
        </Pressable>
        <Type v="labelLg">{t('inc_accept')}</Type>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-evenly' },
  cell: { alignItems: 'center', gap: 8 },
  btn: { width: 76, height: 76, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
});
