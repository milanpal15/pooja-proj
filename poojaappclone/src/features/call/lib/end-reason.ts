import type { StringKey } from '@/i18n';
import type { CallEndReason } from '@/lib/api';

/** Title + explanatory message i18n keys for how a call ended. */
export function endCopy(reason?: CallEndReason | null): { title: StringKey; msg: StringKey | null } {
  switch (reason) {
    case 'declined':
      return { title: 'sum_title_declined', msg: 'sum_msg_declined' };
    case 'missed':
      return { title: 'sum_title_missed', msg: 'sum_msg_missed' };
    case 'cancelled':
      return { title: 'sum_title_cancelled', msg: 'sum_msg_cancelled' };
    case 'out_of_coins':
      return { title: 'sum_title_out_of_coins', msg: 'sum_msg_out_of_coins' };
    case 'failed':
      return { title: 'sum_title_failed', msg: 'sum_msg_failed' };
    case 'admin':
      return { title: 'sum_title_admin', msg: 'sum_msg_admin' };
    default:
      return { title: 'sum_title_completed', msg: null };
  }
}

/** Reasons where the call was actually connected and billed. */
export const wasConnected = (reason?: CallEndReason | null) =>
  reason === 'completed' || reason === 'out_of_coins' || reason === 'admin' || !reason;
