/**
 * `Coins` — the app's one way to show an amount of coins.
 *
 * A gold disc and the number, never "₹251". Spend screens use this for every
 * price, so the icon and the digit grouping cannot drift between screens.
 * `formatCoins` lives in `@/lib/format` for places that need the bare string.
 */

import { StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n';
import { formatCoins } from '@/lib/format';
import { Radius, useTheme } from '@/theme';

import { type Tone, Type } from './type';

export type CoinsProps = {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  tone?: Tone;
  /** Print "551 coins" rather than the bare figure (the design's list/package prices). */
  word?: boolean;
  /** Put the disc after the figure (bill lines), as the design does. */
  trailing?: boolean;
};

const SIZES = {
  sm: { disc: 14, v: 'labelMd' as const },
  md: { disc: 18, v: 'titleSm' as const },
  lg: { disc: 26, v: 'headlineMd' as const },
};

/** The disc on its own, for places that draw their own number. */
export function CoinDisc({ size = 18 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          backgroundColor: c.gold,
          borderColor: c.goldInk,
        },
      ]}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: Radius.full,
          borderWidth: Math.max(1, size * 0.07),
          borderColor: c.goldInk,
        }}
      />
    </View>
  );
}

export function Coins({ value, size = 'md', tone = 'onSurface', word = false, trailing = false }: CoinsProps) {
  const { t } = useLanguage();
  const s = SIZES[size];
  const text = formatCoins(value);

  return (
    <View
      accessible
      accessibilityLabel={`${text} ${t('coins_word')}`}
      style={[styles.row, { gap: Math.round(s.disc * 0.33) }]}>
      {!trailing && <CoinDisc size={s.disc} />}
      <Type v={s.v} tone={tone} numeric>
        {word ? `${text} ${t('coins_word')}` : text}
      </Type>
      {trailing && <CoinDisc size={s.disc} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  disc: {
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
