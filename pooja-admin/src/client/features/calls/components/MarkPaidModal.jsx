import { useState } from 'react';

import { Button, Field, Modal, useConfirm, useToast } from '../../../ui/index.js';
import { formatInr, rupeesToPaise } from '../../../lib/money.js';

/** Record a bank payout already made. The amount cannot exceed what is due. */
export function MarkPaidModal({ row, onSave, onClose }) {
  const [amount, setAmount] = useState(String(row.duePaise / 100));
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const save = async () => {
    const paise = rupeesToPaise(amount);
    const found = {};
    if (paise === null || paise <= 0) found.amount = 'Enter the amount you paid, in rupees.';
    else if (paise > row.duePaise) found.amount = `More than is due (${formatInr(row.duePaise)}).`;
    if (!reference.trim()) found.reference = 'Add the bank transfer reference so it can be traced.';
    setErrors(found);
    if (Object.keys(found).length) return;
    const ok = await confirm({
      title: `Record ${formatInr(paise)} paid to ${row.name}?`,
      message: `Reference ${reference.trim()}. This reduces what ${row.name} is owed and cannot be edited afterwards.`,
      confirmLabel: 'Record payout',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onSave(row.id, paise, reference.trim());
      toast.success(`Recorded ${formatInr(paise)} paid to ${row.name}.`);
      onClose();
    } catch (e) {
      toast.error(`Could not record the payout. ${e.message}`);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={`Mark paid: ${row.name}`}
      subtitle={`${formatInr(row.duePaise)} is due.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Record payout
          </Button>
        </>
      }>
      <Field label="Amount paid (₹)" value={amount} onChange={setAmount} error={errors.amount} inputMode="decimal" />
      <Field label="Bank reference" value={reference} onChange={setReference} error={errors.reference} placeholder="e.g. UTR 4021…" />
    </Modal>
  );
}
