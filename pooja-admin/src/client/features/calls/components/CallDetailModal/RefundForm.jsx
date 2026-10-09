import { useState } from 'react';

import { Button, Field, useConfirm, useToast } from '../../../../ui/index.js';
import { formatCoins } from '../../../../lib/money.js';

/** Goodwill refund of part or all of what this call charged. */
export function RefundForm({ call, maxCoins, onRefund, onDone }) {
  const [coins, setCoins] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    const n = Number(coins);
    if (!/^\d+$/.test(coins.trim()) || n < 1) found.coins = 'Enter a whole number of coins, at least 1.';
    else if (n > maxCoins) found.coins = `At most ${formatCoins(maxCoins)}, what is left to refund.`;
    if (!reason.trim()) found.reason = 'A reason is required. It is saved with the refund.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const ok = await confirm({
      title: `Refund ${formatCoins(n)} coins?`,
      message: `${call.devoteeName} gets ${formatCoins(n)} coins back for this call. Reason: “${reason.trim()}”. It is recorded with your name.`,
      confirmLabel: 'Refund coins',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onRefund(call, { coins: n, reason: reason.trim() });
      toast.success(`Refunded ${formatCoins(n)} coins to ${call.devoteeName}.`);
      onDone();
    } catch (err) {
      toast.error(`Could not refund. ${err.message}`);
      setBusy(false);
    }
  };

  if (maxCoins <= 0) return <p className="ui-field__hint">Nothing left to refund on this call.</p>;
  return (
    <form onSubmit={submit} noValidate>
      <h3 className="feat-subhead">Goodwill refund</h3>
      <div className="feat-grid2" style={{ alignItems: 'start' }}>
        <Field label={`Coins to refund (up to ${formatCoins(maxCoins)})`} value={coins} onChange={setCoins} error={errors.coins} inputMode="numeric" />
        <Field label="Reason (required)" value={reason} onChange={setReason} error={errors.reason} placeholder="e.g. Audio dropped after minute 2" />
      </div>
      <div style={{ marginTop: 12 }}>
        <Button type="submit" variant="outline" loading={busy}>
          Refund coins
        </Button>
      </div>
    </form>
  );
}
