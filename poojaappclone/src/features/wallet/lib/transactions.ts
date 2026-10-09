import type { StringKey } from '@/i18n';
import type { WalletTxnType } from '@/lib/api';

/** Ledger type -> the i18n key for its heading. */
const TXN_LABEL: Record<WalletTxnType, StringKey> = {
  recharge: 'txn_recharge',
  bonus: 'txn_bonus',
  booking_debit: 'txn_booking',
  chadhava_debit: 'txn_chadhava',
  call_debit: 'txn_call',
  refund: 'txn_refund',
  adjustment: 'txn_adjustment',
};

export function txnLabelKey(type: string): StringKey {
  return TXN_LABEL[type as WalletTxnType] ?? 'txn_adjustment';
}

/** "+120" / "-100" with a real minus sign, so the colour is not the only cue. */
export function signedAmount(amount: number, format: (n: number) => string): string {
  return amount < 0 ? `−${format(-amount)}` : `+${format(amount)}`;
}
