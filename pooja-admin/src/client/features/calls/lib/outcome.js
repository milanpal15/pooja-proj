/**
 * How a call ended, in words. The API sends `endReason` once it has ended, and
 * a live `status` ('requested' | 'connected') before that.
 */
const VIEWS = {
  completed: { label: 'Completed', tone: 'success' },
  out_of_coins: { label: 'Ended: out of coins', tone: 'warning' },
  missed: { label: 'Not answered', tone: 'outline' },
  declined: { label: 'Declined', tone: 'outline' },
  cancelled: { label: 'Cancelled by devotee', tone: 'outline' },
  failed: { label: 'Failed', tone: 'danger' },
  admin: { label: 'Ended by admin', tone: 'warning' },
  requested: { label: 'Ringing', tone: 'info' },
  connected: { label: 'Live', tone: 'live' },
};

export const OUTCOME_FILTERS = [
  { value: '', label: 'All outcomes' },
  ...['completed', 'out_of_coins', 'missed', 'declined', 'cancelled', 'failed', 'admin'].map((v) => ({ value: v, label: VIEWS[v].label })),
];

export function outcomeView(call) {
  const key = call.endReason || call.status;
  const v = VIEWS[key] || { label: key || '—', tone: 'neutral' };
  const refunded = Number(call.refundedCoins) || 0;
  return { ...v, label: refunded > 0 ? `${v.label} · refunded ${refunded}` : v.label };
}

export const outcomeLabel = (call) => outcomeView(call).label;
