import { StyleSheet, View } from 'react-native';

import { BottomBar, Button, Type } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { fill, formatCoins } from '@/lib/format';
import { Radius, Space, useTheme } from '@/theme';

/** The sticky "N offerings · X coins  Continue" pill. Hidden until something is chosen. */
export function CartBar({ count, coins, onContinue }: { count: number; coins: number; onContinue: () => void }) {
  const { c } = useTheme();
  const { t } = useLanguage();
  if (count === 0) return null;
  return (
    <BottomBar>
      <View style={[styles.pill, { backgroundColor: c.onSurface }]}>
        <View style={{ flex: 1 }}>
          <Type v="titleSm" color={c.surface} numberOfLines={1} style={{ fontSize: 15 }}>
            {count === 1 ? t('cs_n_one') : fill(t('cs_n_many'), { n: count })}
          </Type>
          <Type v="labelMd" color={c.surface} numberOfLines={1} style={{ fontWeight: '400' }}>
            {`${formatCoins(coins)} ${t('coins_word')}`}
          </Type>
        </View>
        <Button label={t('cs_continue')} iconRight="chevronRight" size="sm" onPress={onContinue} />
      </View>
    </BottomBar>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, borderRadius: Radius.full, paddingLeft: 22, paddingRight: 8, paddingVertical: 8 },
});
