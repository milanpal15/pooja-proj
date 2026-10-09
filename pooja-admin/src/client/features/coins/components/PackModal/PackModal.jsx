import { useState } from 'react';

import { Button, Modal, useConfirm, useToast } from '../../../../ui/index.js';
import { blankForm, formProblem, formToBody, packToForm } from '../../lib/packs.js';
import { idOf } from '../../../../lib/ids.js';
import { PackForm } from './PackForm.jsx';

/**
 * Add or edit one pack. `pack` null = a new one. Saving is blocked, with the
 * same sentence the API would answer, when coins are fewer than the price buys.
 * Mount it only while open (it initialises its form from `pack`).
 */
export function PackModal({ pack, nextOrder, coinsPerRupee, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => (pack ? packToForm(pack) : blankForm(nextOrder)));
  const [problem, setProblem] = useState(null);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const isNew = !pack;

  const change = (next) => {
    setForm(next);
    if (problem) setProblem(formProblem(next, coinsPerRupee));
  };

  const save = async () => {
    const found = formProblem(form, coinsPerRupee);
    setProblem(found);
    if (found) return;
    setSaving(true);
    try {
      await onSave(pack ? idOf(pack) : null, formToBody(form));
      toast.success(isNew ? 'Pack added' : 'Pack saved. Applies to the next purchase.');
      onClose();
    } catch (e) {
      // Keep the form and what was typed; say why.
      setProblem(e.message);
      toast.error(`Could not save the pack. ${e.message}`);
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this pack?',
      message: `The ${pack.coins}-coin pack for ₹${pack.price} disappears from the app. Past purchases are not affected.`,
      confirmLabel: 'Delete pack',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await onDelete(pack);
      toast.success('Pack deleted');
      onClose();
    } catch (e) {
      toast.error(`Could not delete the pack. ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title={isNew ? 'Add coin pack' : 'Edit coin pack'}
      subtitle="What devotees see and pay. Changes apply to the next purchase."
      footerExtra={
        !isNew && (
          <Button variant="danger" onClick={remove} disabled={saving}>
            Delete pack
          </Button>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save pack
          </Button>
        </>
      }>
      <PackForm form={form} onChange={change} coinsPerRupee={coinsPerRupee} problem={problem} />
    </Modal>
  );
}
