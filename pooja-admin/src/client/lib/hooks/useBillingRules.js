import { api } from '../../api.js';
import { useLoader } from './useLoader.js';

/**
 * The billing rules, shared by every tab that needs one number out of them:
 * `coinsPerRupee` (coin packs), `defaultSharePct` (new astrologers), and the
 * whole form on Calls & Payouts. Not polled — it changes when an admin saves.
 */
export function useBillingRules({ enabled = true } = {}) {
  const loader = useLoader(() => api.billingRules.get(), { enabled });
  const save = async (rules) => {
    await api.billingRules.save(rules);
    await loader.reload();
  };
  return { ...loader, rules: loader.data, save };
}
