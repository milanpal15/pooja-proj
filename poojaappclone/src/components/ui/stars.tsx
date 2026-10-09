/** `Stars` — a 1-5 rating, read-only or tappable. */

import { Pressable, StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { fill } from '@/lib/format';
import { useTheme } from '@/theme';

import { Icon } from './icon';

export function Stars({
  value,
  onChange,
  size = 16,
}: {
  /** 0-5; fractions round to the nearest star. */
  value: number;
  /** Present makes the stars tappable. */
  onChange?: (rating: number) => void;
  size?: number;
}) {
  const { c } = useTheme();
  const { t } = useLanguage();
  const filled = Math.round(value);

  return (
    <View
      style={styles.row}
      accessibilityRole={onChange ? 'adjustable' : 'image'}
      accessibilityLabel={fill(t('ps_stars_label'), { n: filled })}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = <Icon name="star" size={size} color={n <= filled ? c.gold : c.outline} filled={n <= filled} />;
        return onChange ? (
          <Pressable key={n} hitSlop={6} onPress={() => onChange(n)} accessibilityRole="button" accessibilityLabel={fill(t('ps_stars_label'), { n })}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 4, alignItems: 'center' } });
