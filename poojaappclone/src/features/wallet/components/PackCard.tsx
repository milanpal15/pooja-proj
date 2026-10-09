import { Pressable, StyleSheet, View } from 'react-native';

import { CoinDisc, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { CoinPack } from '@/lib/api';
import { fill, formatCoins, formatRupees } from '@/lib/format';
import { Radius, Saffron, useTheme } from '@/theme';

type Props = {
  pack: CoinPack;
  selected: boolean;
  onPress: () => void;
  /** Centred, narrow — the three-up row in the "not enough coins" sheet. */
  compact?: boolean;
};

/** One coin pack: coins, the "{n}% EXTRA" sale label, and the rupee price. */
export function PackCard({ pack, selected, onPress, compact = false }: Props) {
  const { c, scheme } = useTheme();
  const { t } = useLanguage();

  const sale = pack.onSale && pack.salePct > 0;
  const saleLabel = fill(t('pack_extra_label'), { pct: pack.salePct });
  const detail = sale
    ? fill(t('pack_base_extra'), {
        base: formatCoins(pack.baseCoins),
        extra: formatCoins(pack.extraCoins),
      })
    : t('pack_no_extra');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${formatCoins(pack.coins)} ${t('coins_word')}, ${formatRupees(pack.price)}${sale ? `, ${saleLabel}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact ? styles.compact : styles.full,
        {
          borderWidth: 1.5,
          borderColor: selected ? Saffron[400] : c.outlineVariant,
          backgroundColor: selected ? (scheme === 'dark' ? c.containerHighest : Saffron[50]) : c.containerLowest,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      {sale && (
        <View
          pointerEvents="none"
          style={[styles.badgeRow, { alignItems: compact ? 'center' : 'flex-start', paddingLeft: compact ? 0 : 12 }]}>
          <View style={[styles.badge, { backgroundColor: c.success }]}>
            <Type v="labelSm" color="#FFFFFF" numberOfLines={1}>
              {saleLabel}
            </Type>
          </View>
        </View>
      )}
      <View style={styles.coinsRow}>
        {!compact && <CoinDisc size={18} />}
        <Type v={compact ? 'titleMd' : 'titleLg'} numeric>
          {formatCoins(pack.coins)}
        </Type>
      </View>
      <Type v="labelSm" tone="onSurfaceFaint">
        {compact ? t('coins_word') : detail}
      </Type>
      <Type v="titleSm" tone="goldInk" numeric style={{ marginTop: 4 }}>
        {formatRupees(pack.price)}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, minHeight: 84, position: 'relative' },
  full: { alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12, gap: 2, minHeight: 92 },
  compact: { alignItems: 'center', paddingHorizontal: 6, paddingTop: 14, paddingBottom: 10, gap: 2 },
  badgeRow: { position: 'absolute', top: -10, left: 0, right: 0 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  coinsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
