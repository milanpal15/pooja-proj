import { Pressable, StyleSheet, View } from 'react-native';

import { Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import type { CoinPack } from '@/lib/api';
import { fill, formatCoins, formatRupees } from '@/lib/format';
import { Radius, Saffron, Space, useTheme } from '@/theme';

type Props = {
  justEnough?: CoinPack;
  best?: CoinPack;
  selectedId?: string;
  onSelect: (pack: CoinPack) => void;
  balance: number;
  /** What the thing being bought costs, so "after booking" can be shown. */
  needed: number;
};

/** The two suggestions: the smallest pack that covers the gap, and the best value. */
export function ShortfallPicks({ justEnough, best, selectedId, onSelect, balance, needed }: Props) {
  const { t } = useLanguage();
  return (
    <View accessibilityRole="radiogroup" style={styles.col}>
      {justEnough && (
        <Pick
          pack={justEnough}
          tag={t('just_enough')}
          tagKind="info"
          selected={justEnough.id === selectedId}
          onPress={() => onSelect(justEnough)}
          detail={fill(t('after_adding'), {
            a: formatCoins(balance + justEnough.coins),
            b: formatCoins(Math.max(0, balance + justEnough.coins - needed)),
          })}
        />
      )}
      {best && (
        <Pick
          pack={best}
          tag={`${fill(t('pack_extra_label'), { pct: best.salePct })} · ${t('best_value')}`}
          tagKind="sale"
          selected={best.id === selectedId}
          onPress={() => onSelect(best)}
          detail={fill(t('pack_base_extra'), {
            base: formatCoins(best.baseCoins),
            extra: formatCoins(best.extraCoins),
          })}
        />
      )}
    </View>
  );
}

function Pick({
  pack,
  tag,
  tagKind,
  selected,
  onPress,
  detail,
}: {
  pack: CoinPack;
  tag: string;
  tagKind: 'info' | 'sale';
  selected: boolean;
  onPress: () => void;
  detail: string;
}) {
  const { c, scheme } = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${tag}. ${formatCoins(pack.coins)} ${t('coins_word')}, ${formatRupees(pack.price)}. ${detail}`}
      onPress={onPress}
      style={[
        styles.pick,
        {
          borderWidth: 1.5,
          borderColor: selected ? Saffron[400] : c.outlineVariant,
          backgroundColor: selected ? (scheme === 'dark' ? c.containerHighest : Saffron[50]) : c.containerLowest,
        },
      ]}>
      <View
        style={[styles.tag, { backgroundColor: tagKind === 'sale' ? c.success : Saffron[400] }]}
        pointerEvents="none">
        <Type v="labelSm" color="#FFFFFF" style={{ fontSize: 11, letterSpacing: 0 }}>
          {tag}
        </Type>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Type v="titleMd" numeric style={{ fontSize: 17 }}>
          {`${formatCoins(pack.coins)} ${t('coins_word')}`}
        </Type>
        <Type v="labelSm" tone="onSurfaceVariant" style={{ fontSize: 12, fontWeight: '400', letterSpacing: 0 }}>
          {detail}
        </Type>
      </View>
      <View style={[styles.buy, { backgroundColor: c.primary }]}>
        <Type v="labelMd" tone="onPrimary" numeric style={{ fontWeight: '700' }}>
          {formatRupees(pack.price)}
        </Type>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    minHeight: 68,
  },
  tag: { position: 'absolute', top: -10, right: 14, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, zIndex: 1 },
  buy: { height: 38, paddingHorizontal: 18, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
