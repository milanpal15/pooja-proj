import { useState } from 'react';

import { api } from '../../../api.js';
import { Button, Card, Field, ReadoutField, useConfirm, useToast } from '../../../ui/index.js';
import { formatCoins, formatSignedCoins } from '../../../lib/money.js';
import { WalletPicker } from './WalletPicker.jsx';

/** "+50", "-20", "−20" -> 50 / -20, or null if it is not a non-zero whole number. */
function parseCoins(text) {
  const t = String(text).trim().replace(/[−–]/g, '-');
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number(t);
  return n === 0 ? null : n;
}

/**
 * Manual correction of one devotee's balance. A reason is required, the admin
 * confirms the exact effect, and each submit carries its own requestId so a
 * double click can never apply it twice.
 */
export function AdjustWalletForm({ onAdjusted }) {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    const coins = parseCoins(amount);
    const found = {};
    if (!wallet) found.wallet = 'Choose a devotee first.';
    if (coins === null) found.amount = 'Enter a whole number of coins, like +50 or −20.';
    else if (wallet && wallet.balance + coins < 0) found.amount = `That would take the balance below zero (it is ${wallet.balance}).`;
    if (!reason.trim()) found.reason = 'A reason is required. It is saved with the adjustment.';
    setErrors(found);
    if (Object.keys(found).length) return;

    const ok = await confirm({
      title: 'Apply this adjustment?',
      message: (
        <>
          {formatSignedCoins(coins)} coins for <b>{wallet.name || wallet.contact}</b>. Balance {formatCoins(wallet.balance)} →{' '}
          {formatCoins(wallet.balance + coins)}. Reason: “{reason.trim()}”. This is recorded with your name and cannot be undone, only offset.
        </>
      ),
      confirmLabel: 'Apply adjustment',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const res = await api.adjustWallet({
        uid: wallet.uid,
        amount: coins,
        reason: reason.trim(),
        requestId: crypto.randomUUID(),
      });
      toast.success(`Adjusted ${wallet.name || 'wallet'} by ${formatSignedCoins(coins)} coins. New balance ${formatCoins(res?.balance)}.`);
      setWallet(null);
      setAmount('');
      setReason('');
      onAdjusted?.();
    } catch (err) {
      // Nothing is cleared: the admin can fix and resubmit.
      toast.error(err.code === 'insufficient_coins' ? 'The devotee does not have that many coins.' : `Could not adjust. ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Adjust a wallet" description="For goodwill credits and correcting a failed charge. Every adjustment needs a reason and is recorded with your name.">
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="feat-grid2" style={{ alignItems: 'start' }}>
          <div>
            <WalletPicker value={wallet} onChange={setWallet} />
            {errors.wallet && <p className="ui-field__error">{errors.wallet}</p>}
          </div>
          <ReadoutField label="Current balance">{wallet ? `${formatCoins(wallet.balance)} coins` : '—'}</ReadoutField>
          <Field label="Coins (+ or −)" placeholder="+50" value={amount} onChange={setAmount} error={errors.amount} inputMode="text" />
          <Field label="Reason (required)" placeholder="e.g. Call dropped at 02:14, refunded 1 minute" value={reason} onChange={setReason} error={errors.reason} />
        </div>
        <div>
          <Button type="submit" loading={busy}>
            Apply adjustment
          </Button>
        </div>
      </form>
    </Card>
  );
}
