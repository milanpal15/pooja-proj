import { api } from '../../../api.js';
import { endOfDayIso, startOfDayIso } from '../../../lib/dates.js';
import { useLoader } from '../../../lib/hooks/useLoader.js';

export const CALL_LIMIT = 200;
const POLL_MS = 15000;

/**
 * The call log for a date range / outcome, plus the calls live right now.
 * Polled so a call that starts or ends shows up without a refresh.
 * `filters`: { from: 'YYYY-MM-DD'|'', to: 'YYYY-MM-DD'|'', outcome }.
 * @returns {{ data: { calls, live }, status, error, offline, actions }}
 */
export function useCalls({ from, to, outcome }, { enabled = true } = {}) {
  const loader = useLoader(
    () => api.calls({ from: startOfDayIso(from), to: endOfDayIso(to), outcome, limit: CALL_LIMIT }),
    { deps: [from, to, outcome], pollMs: POLL_MS, enabled },
  );
  return {
    data: loader.data || { calls: [], live: [] },
    status: loader.status,
    error: loader.error,
    offline: loader.offline,
    actions: {
      reload: loader.reload,
      async endCall(call) {
        await api.endCall(call.id);
        await loader.reload();
      },
      async refund(call, { coins, reason }) {
        await api.refundCall(call.id, { coins, reason, requestId: crypto.randomUUID() });
        await loader.reload();
      },
    },
  };
}
