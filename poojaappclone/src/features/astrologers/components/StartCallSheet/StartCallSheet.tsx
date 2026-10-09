import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, Sheet, Type } from '@/components/ui';
import { assetUrl, useContent } from '@/providers/content';
import { useLanguage } from '@/i18n';
import { useStartCall } from '@/features/call';
import { AddCoinsSheet, useWallet } from '@/features/wallet';
import type { Astrologer } from '@/lib/api';
import { fill } from '@/lib/fill';
import { formatCoins } from '@/lib/format';

import { coinsToStart, maxMinutes, shortfall } from '../../lib/max-minutes';
import { PresenceBadge } from '../PresenceBadge';
import { BillingNote } from './BillingNote';
import { CostBreakdown } from './CostBreakdown';

const DEFAULT_MIN_MINUTES = 3;

/**
 * "Start call" — shows the price and the billing rule BEFORE any coin moves.
 * If the balance cannot cover the minimum, the wallet's Add-coins sheet takes
 * over with the exact shortfall instead of letting the call start.
 */
export function StartCallSheet({
  astrologer,
  onClose,
}: {
  /** The astrologer being called; null closes the sheet. */
  astrologer: Astrologer | null;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const { setting } = useContent();
  const wallet = useWallet();
  const [adding, setAdding] = useState(false);
  const [serverShortfall, setServerShortfall] = useState<number | null>(null);
  const close = () => {
    setAdding(false);
    setServerShortfall(null);
    onClose();
  };
  const { start, starting } = useStartCall({
    onInsufficient: (s) => {
      setServerShortfall(s ?? null);
      setAdding(true);
    },
    onStarted: close,
  });

  // Fresh balance whenever the sheet opens.
  const id = astrologer?.id;
  const { refresh } = wallet;
  useEffect(() => {
    if (id) refresh();
  }, [id, refresh]);

  if (!astrologer) return null;

  const rate = astrologer.ratePerMin;
  const minMinutes = Math.max(1, setting('minMinutes', DEFAULT_MIN_MINUTES));
  const balance = wallet.balance;
  const short = balance === null ? 0 : shortfall(balance, minMinutes, rate);
  const needed = coinsToStart(minMinutes, rate);

  return (
    <>
      <Sheet visible={!adding} onClose={close} title={t('start_title')}>
        <View style={styles.head}>
          <Avatar
            name={astrologer.name}
            photoUrl={assetUrl(astrologer.photoUrl ?? undefined)}
            size={56}
            presence={astrologer.presence}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Type v="titleLg" numberOfLines={1}>
              {astrologer.name}
            </Type>
            {!!astrologer.specialities?.length && (
              <Type v="bodySm" tone="onSurfaceVariant" numberOfLines={1}>
                {astrologer.specialities.join(' · ')}
              </Type>
            )}
            <PresenceBadge presence={astrologer.presence} />
          </View>
        </View>

        <CostBreakdown rate={rate} balance={balance} minutes={balance === null ? 0 : maxMinutes(balance, rate)} />
        {short > 0 && (
          <Type v="bodySm" tone="error">
            {fill(t('start_need'), { n: formatCoins(needed) })}
          </Type>
        )}
        <BillingNote />

        {short > 0 ? (
          <Button label={t('call_add_coins')} icon="plus" block onPress={() => setAdding(true)} />
        ) : (
          <Button
            label={starting ? t('start_cta_busy') : fill(t('start_cta'), { n: formatCoins(rate) })}
            icon="forward"
            loading={starting}
            block
            onPress={() => start(astrologer)}
          />
        )}
        <Button label={t('cancel')} variant="ghost" block onPress={close} />
      </Sheet>

      <AddCoinsSheet
        visible={adding}
        onClose={() => setAdding(false)}
        shortfall={serverShortfall ?? (short || undefined)}
        onPurchased={() => {
          setAdding(false);
          setServerShortfall(null);
          wallet.refresh();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
