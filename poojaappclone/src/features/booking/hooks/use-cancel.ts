import { useCallback } from 'react';
import { Alert } from 'react-native';

import { useToast } from '@/components/ui';
import { type StringKey, useLanguage } from '@/i18n';
import { cancelBooking, cancelChadhavaOrder } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { useWallet } from '@/providers/wallet';

type Copy = { title: StringKey; body: StringKey; done: StringKey; failed: StringKey; action: StringKey };

/**
 * Cancel with a confirm dialog (a real choice, so `Alert`, not a toast).
 * The server decides eligibility (`canCancel`, the cut-off); a refusal is
 * reported, never second-guessed. The wallet is re-read afterwards because the
 * refund changed it.
 */
function useCancel(
  run: (id: string) => Promise<unknown>,
  copy: Copy,
  onDone: () => void,
) {
  const { t } = useLanguage();
  const toast = useToast();
  const { refresh } = useWallet();

  return useCallback(
    (id: string, coins: number) => {
      Alert.alert(t(copy.title), fill(t(copy.body), { n: formatCoins(coins) }), [
        { text: t('ps_keep'), style: 'cancel' },
        {
          text: t(copy.action),
          style: 'destructive',
          onPress: async () => {
            try {
              await run(id);
              toast.success(t(copy.done));
              refresh();
              onDone();
            } catch {
              toast.error(t(copy.failed));
              onDone(); // the server's view may differ from ours (cut-off passed) — reload it
            }
          },
        },
      ]);
    },
    [t, toast, refresh, run, copy, onDone],
  );
}

const POOJA_COPY: Copy = { title: 'ps_cancel_title', body: 'ps_cancel_body', done: 'ps_cancelled_toast', failed: 'ps_cancel_failed', action: 'ps_cancel_btn' };
const ORDER_COPY: Copy = { title: 'cs_cancel_title', body: 'cs_cancel_body', done: 'cs_cancelled_toast', failed: 'cs_cancel_failed', action: 'cs_cancel_btn' };

export const useCancelBooking = (onDone: () => void) => useCancel(cancelBooking, POOJA_COPY, onDone);
export const useCancelOrder = (onDone: () => void) => useCancel(cancelChadhavaOrder, ORDER_COPY, onDone);
