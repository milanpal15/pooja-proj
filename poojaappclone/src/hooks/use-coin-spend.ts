import { useCallback, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/ui';
import { useLanguage } from '@/i18n';
import { ApiError, isOffline } from '@/lib/api';
import { newRequestId } from '@/lib/format';
import { createRequestKeeper } from '@/lib/request-key';
import { useWallet } from '@/providers/wallet';

type Options<R> = {
  /** Describes the order's contents; a change means a new idempotency key. */
  signature: string;
  /** Send the order. The app never sends a price — only what was chosen. */
  submit: (requestId: string) => Promise<R>;
  onSuccess: (result: R) => void;
  /** Map a server `code` to a message the devotee sees (409 booking_closed ...). */
  messageFor?: (code: string | undefined) => string | undefined;
};

/**
 * "Pay N coins", for pooja bookings and chadhava orders alike.
 *
 *  - 402 `insufficient_coins` -> `shortfall` is set; the screen opens the
 *    add-coins sheet over the SAME screen (so the form stays intact) and calls
 *    `pay()` again from `onPurchased`. Nothing was charged, so the key is kept.
 *  - offline / 5xx            -> key kept: the first try may have landed, and
 *    the server returns the same order for the same id instead of charging again.
 *  - other 4xx                -> final answer; key dropped, message shown inline.
 */
export function useCoinSpend<R>({ signature, submit, onSuccess, messageFor }: Options<R>) {
  const { t } = useLanguage();
  const toast = useToast();
  const { setBalance, refresh } = useWallet();
  const keeper = useMemo(() => createRequestKeeper(newRequestId), []);
  const inflight = useRef(false);

  const [busy, setBusy] = useState(false);
  const [shortfall, setShortfall] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await submit(keeper.idFor(signature));
      keeper.clear();
      // The response may carry the new balance; either way re-read to be sure.
      const bal = (result as { balance?: unknown } | null)?.balance;
      if (typeof bal === 'number') setBalance(bal);
      else refresh();
      onSuccess(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'insufficient_coins') {
        if (typeof e.body?.balance === 'number') setBalance(e.body.balance);
        const needed = Number(e.body?.needed);
        const bal = Number(e.body?.balance);
        const short = Number(e.body?.shortfall) || (needed > bal ? needed - bal : 1);
        setShortfall(Math.max(1, short));
      } else if (isOffline(e)) {
        toast.error(t('offline_retry_safe'));
      } else if (e instanceof ApiError) {
        if (e.status < 500) keeper.clear();
        const msg = messageFor?.(e.code) ?? e.message;
        setError(msg);
        toast.error(msg);
      } else {
        toast.error(t('ps_pay_failed'));
      }
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [keeper, signature, submit, onSuccess, messageFor, setBalance, refresh, t, toast]);

  const dismissShortfall = useCallback(() => setShortfall(null), []);
  return { pay, busy, error, shortfall, dismissShortfall };
}
