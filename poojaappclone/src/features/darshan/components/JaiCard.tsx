import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { Radius, useTheme } from '@/theme';

import { compactCount } from '../lib/live-logic';

/** The Jai button and, only when the number is real, how many devotees said it this aarti. */
export function JaiCard({
  label,
  count,
  busy,
  onPress,
}: {
  label: string;
  count: number | null;
  busy: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const n = compactCount(count);
  return (
    <View style={[styles.card, { backgroundColor: c.containerLowest, borderColor: c.outlineVariant }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [styles.btn, { backgroundColor: c.primary, opacity: pressed || busy ? 0.85 : 1 }]}>
        <Icon name="diya" size={18} color={c.onPrimary} filled />
        <Type v="labelLg" color={c.onPrimary}>
          {label}
        </Type>
      </Pressable>
      {n !== null && (
        <Type v="bodySm" tone="onSurfaceVariant" style={styles.text}>
          {n} {t('ld_jai_count')}
        </Type>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg + 2, borderWidth: 1, padding: 12 },
  btn: { height: 46, paddingHorizontal: 18, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1 },
});
