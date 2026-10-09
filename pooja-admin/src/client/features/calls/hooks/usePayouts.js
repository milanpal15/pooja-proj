import { api } from '../../../api.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

/** What each astrologer has earned, been paid, and is still owed. */
export function usePayouts({ enabled = true } = {}) {
  const loader = useLoader(() => api.payoutSummary(), { enabled });
  return {
    data: loader.data || [],
    status: loader.status,
    error: loader.error,
    offline: loader.offline,
    actions: {
      reload: loader.reload,
      async markPaid(astrologerId, amountPaise, reference) {
        await api.payouts.create({ astrologerId, amountPaise, reference });
        await loader.reload();
      },
    },
  };
}
