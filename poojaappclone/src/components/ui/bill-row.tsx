/**
 * `BillRow` — one line of a coin bill: a label and an amount in coins.
 *
 * Booking and e-Chadhava both end in the same itemised bill. Two features
 * need it, so it lives in the kit rather than being imported across them.
 */

import { StyleSheet, View } from 'react-native';

import { Space } from '@/theme';

import { Coins } from './coins';
import { Divider } from './card';
import { type Tone, Type } from './type';

export type BillRowProps = {
  label: string;
  coins: number;
  /** The total line: bigger, in the primary colour. */
  strong?: boolean;
  tone?: Tone;
  /** Omit the rule beneath (the last row). */
  last?: boolean;
};

export function BillRow({ label, coins, strong = false, tone, last = false }: BillRowProps) {
  return (
    <>
      <View style={styles.row}>
        <Type v={strong ? 'titleMd' : 'bodyMd'} tone={strong ? 'onSurface' : 'onSurfaceVariant'} style={styles.label}>
          {label}
        </Type>
        <Coins value={coins} size={strong ? 'md' : 'sm'} tone={tone ?? (strong ? 'primary' : 'onSurface')} trailing />
      </View>
      {!last && <Divider />}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingVertical: 13 },
  label: { flex: 1 },
});
