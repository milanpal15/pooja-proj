import { api } from '../../../api.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

export const TXN_LIMIT = 100;

/** The newest wallet transactions, optionally of one type. */
export function useTransactions(type, { enabled = true } = {}) {
  const loader = useLoader(() => api.walletTransactions({ type, limit: TXN_LIMIT }), { deps: [type], enabled });
  return { data: loader.data, status: loader.status, error: loader.error, offline: loader.offline, actions: { reload: loader.reload } };
}
