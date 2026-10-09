import { useState } from 'react';

import { Button, Modal, useConfirm, useToast } from '../../../../ui/index.js';
import { idOf } from '../../../../lib/ids.js';
import { Avatar } from '../Avatar.jsx';
import { blankForm, toBody, toForm, validate } from '../../lib/form.js';
import { AstrologerForm } from './AstrologerForm.jsx';

/**
 * Add / edit one astrologer. `astrologer` null = adding. Suspend, Reactivate and
 * Delete live in the footer's far-left and each asks first. Mount only while open.
 */
export function AstrologerModal({ astrologer, defaultSharePct, onSave, onRemove, onSuspend, onReactivate, onClose }) {
  const [form, setForm] = useState(() => (astrologer ? toForm(astrologer) : blankForm(defaultSharePct)));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();
  const isNew = !astrologer;
  const suspended = astrologer?.status === 'suspended';

  const change = (next) => {
    setForm(next);
    if (Object.keys(errors).length) setErrors(validate(next));
  };

  const run = async (work, doneMessage, failMessage) => {
    setBusy(true);
    setFormError('');
    try {
      await work();
      toast.success(doneMessage);
      onClose();
    } catch (e) {
      // A duplicate sign-in handle (409) lands here: keep the form, say why.
      setFormError(e.message);
      toast.error(`${failMessage} ${e.message}`);
      setBusy(false);
    }
  };

  const save = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    run(() => onSave(astrologer ? idOf(astrologer) : null, toBody(form)), isNew ? 'Astrologer added. They are invited until they sign in.' : 'Saved. Applies to the next call.', 'Could not save.');
  };

  const guarded = async (cfg, work, done, fail) => {
    if (await confirm(cfg)) run(work, done, fail);
  };

  const toggleSuspend = () =>
    suspended
      ? guarded(
          { title: `Reactivate ${astrologer.name}?`, message: 'They can sign in to the astrologer view again and, if listed, take calls.', confirmLabel: 'Reactivate' },
          () => onReactivate(astrologer),
          'Reactivated',
          'Could not reactivate.',
        )
      : guarded(
          {
            title: `Suspend ${astrologer.name}?`,
            message: 'They are taken offline and hidden from the app, and cannot take calls until reactivated. A call in progress is not cut off.',
            confirmLabel: 'Suspend astrologer',
            tone: 'danger',
          },
          () => onSuspend(astrologer),
          'Suspended',
          'Could not suspend.',
        );

  const remove = () =>
    guarded(
      {
        title: `Delete ${astrologer.name}?`,
        message: 'Their profile is removed and they lose astrologer access. Past calls and earnings stay on record. This cannot be undone.',
        confirmLabel: 'Delete astrologer',
        tone: 'danger',
      },
      () => onRemove(astrologer),
      'Astrologer deleted',
      'Could not delete.',
    );

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      title={isNew ? 'Add astrologer' : 'Edit astrologer'}
      subtitle={isNew ? 'They sign in with the email or mobile you enter here.' : astrologer.name}
      lead={!isNew && <Avatar name={astrologer.name} large />}
      footerExtra={
        !isNew && (
          <>
            <Button variant="danger" onClick={toggleSuspend} disabled={busy}>
              {suspended ? 'Reactivate astrologer' : 'Suspend astrologer'}
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          </>
        )
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {isNew ? 'Add astrologer' : 'Save'}
          </Button>
        </>
      }>
      <AstrologerForm form={form} errors={errors} onChange={change} astrologer={astrologer} formError={formError} />
    </Modal>
  );
}
