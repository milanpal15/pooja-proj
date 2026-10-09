import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { fill } from '@/lib/fill';
import { Radius, useTheme } from '@/theme';

/** Optional 1–5 rating. `value` locks it once the server has one. */
export function RatingPicker({
  value,
  disabled,
  onPick,
}: {
  value: number | null;
  disabled?: boolean;
  onPick: (n: number) => void;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={fill(t('sum_star_aria'), { n })}
            accessibilityState={{ selected: value === n, disabled }}
            disabled={disabled}
            onPress={() => onPick(n)}
            style={[
              styles.star,
              {
                backgroundColor: on ? c.accentContainer : c.containerLowest,
                borderColor: on ? c.accent : c.outlineVariant,
              },
            ]}>
            <Icon name="star" size={20} color={on ? c.primary : c.onSurfaceFaint} strokeWidth={2} />
            <Type v="labelSm" tone={on ? 'primary' : 'onSurfaceVariant'}>
              {String(n)}
            </Type>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  star: {
    flex: 1,
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
