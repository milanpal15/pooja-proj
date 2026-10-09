import { useCallback, useState } from 'react';

import { useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { useLanguage } from '@/i18n';
import { type CoinPack, createCoinOrder, isOffline, verifyCoinOrder } from '@/lib/api';
import { fill, formatCoins } from '@/lib/format';
import { useWallet } from '@/providers/wallet';

import { collectPayment, PaymentsUnavailableError } from '../lib/razorpay';

export type RechargeStatus = 'idle' | 'creating' | 'paying' | 'verifying';

/**
 * Buying coins: order -> checkout -> verify -> wallet.
 *
 * `buy` resolves `true` only when coins were actually credited, so callers
 * can resume whatever sent the devotee here (a booking that was short).
 * It never throws and never double-submits: while a purchase is in flight a
 * second tap is ignored.
 */
export function useRecharge() {
  const { t } = useLanguage();
  const toast = useToast();
  const { user } = useAuth();
  const { setBalance, refresh } = useWallet();

  const [status, setStatus] = useState<RechargeStatus>('idle');
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback(
    (message: string) => {
      setError(message);
      toast.error(message);
    },
    [toast],
  );

  const buy = useCallback(
    async (pack: CoinPack): Promise<boolean> => {
      if (status !== 'idle') return false;
      setError(null);
      try {
        setStatus('creating');
        const order = await createCoinOrder(pack.id);
        setTestMode(order.provider === 'mock');

        setStatus('paying');
        const outcome = await collectPayment(order, {
          name: user?.name,
          email: user?.email ?? undefined,
          contact: user?.method === 'phone' ? user.contact : undefined,
        });
        if (outcome.kind === 'cancelled') {
          toast.info(t('payment_cancelled'));
          return false;
        }

        setStatus('verifying');
        try {
          const res = await verifyCoinOrder(order.orderId, outcome.body);
          setBalance(res.balance);
          toast.success(fill(t('coins_added'), { n: formatCoins(res.coinsAdded) }));
          return true;
        } catch {
          // Money may have moved. The webhook credits the order even when
          // this call never lands, so say that rather than "failed".
          toast.info(t('payment_pending'));
          refresh();
          return false;
        }
      } catch (e) {
        if (e instanceof PaymentsUnavailableError) {
          setError(t('payments_need_build'));
          toast.error(t('payments_need_build'), { description: t('payments_need_build_msg') });
        } else if (isOffline(e)) {
          fail(t('offline_spend'));
        } else {
          fail(t('payment_failed'));
        }
        return false;
      } finally {
        setStatus('idle');
      }
    },
    [status, user, toast, t, setBalance, refresh, fail],
  );

  return { buy, status, busy: status !== 'idle', testMode, error };
}
